// What the worker does with each kind of job.
//
// The chain is: ingest -> extract -> link, and eval on top of it. Each job does one step and
// queues the next one, so the dashboard can show the progress step by step.

import {
  DecisionsRepository,
  EvalRunsRepository,
  JobRow,
  JobsRepository,
  PostgresLlmCallStore,
  TopicsRepository,
} from "@dejaview/db";
import {
  fetchDiscourseThread,
  fetchGithubThread,
  parseDiscourseUrl,
  parseGithubUrl,
  threadFromUpload,
} from "@dejaview/ingest";
import type { Thread } from "@dejaview/shared";
import type { Pool } from "pg";
import type { LinkerAdapter, PipelineAdapter } from "./adapters.js";

export interface WorkerContext {
  pool: Pool;
  topics: TopicsRepository;
  decisions: DecisionsRepository;
  jobs: JobsRepository;
  llmCalls: PostgresLlmCallStore;
  evalRuns: EvalRunsRepository;
  pipeline: PipelineAdapter | null;
  linker: LinkerAdapter | null;
  /** Where the CPython clone lives, for the linker. */
  cpythonDir: string;
  githubToken: string | undefined;
  /** Reports the progress of a job so the dashboard can show it. */
  report: (job: JobRow, stage: string, done: number, total: number) => Promise<void>;
}

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

function payloadNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Fetches the thread a job is about, from a URL or from an uploaded file. */
export async function fetchThreadForJob(payload: Record<string, unknown>): Promise<Thread> {
  const filePath = payloadString(payload, "filePath");
  if (filePath) {
    return threadFromUpload(filePath, {
      topicSlug: payloadString(payload, "topicSlug") || undefined,
      pepNumber: payloadNumber(payload, "pepNumber"),
      title: payloadString(payload, "topicTitle") || undefined,
    });
  }

  const url = payloadString(payload, "url");
  const topicSlug = payloadString(payload, "topicSlug") || undefined;
  const pepNumber = payloadNumber(payload, "pepNumber");

  if (parseDiscourseUrl(url)) {
    return fetchDiscourseThread(url, { topicSlug, pepNumber });
  }
  if (parseGithubUrl(url)) {
    return fetchGithubThread(url, { topicSlug, pepNumber });
  }
  throw new Error(`Cannot understand "${url}" - it is not a Discourse or GitHub link`);
}

/** ingest: fetch the discussion and store it, then queue the extraction. */
export async function handleIngest(job: JobRow, context: WorkerContext): Promise<void> {
  await context.report(job, "fetching", 0, 1);
  const thread = await fetchThreadForJob(job.payload);
  await context.report(job, "storing", 0, 1);

  const saved = await context.topics.saveThread(thread);
  await context.report(job, "queued", 1, 1);

  await context.jobs.enqueue("extract", {
    topicId: saved.topicId,
    sourceId: saved.sourceId,
    topicSlug: thread.topic.slug,
    // So GET /api/jobs/:id can tell the dashboard which job comes next.
    parentJobId: job.id,
  });
}

/** extract: let the pipeline find the decisions, then store them. */
export async function handleExtract(job: JobRow, context: WorkerContext): Promise<void> {
  if (!context.pipeline) {
    throw new Error("packages/pipeline is not available yet - ask Abhijeet for the extract job");
  }
  const sourceId = payloadNumber(job.payload, "sourceId");
  const topicId = payloadNumber(job.payload, "topicId");
  if (sourceId === null || topicId === null) {
    throw new Error("The extract job needs a sourceId and a topicId");
  }

  const thread = await context.topics.loadThread(sourceId);
  if (!thread) throw new Error(`Source ${sourceId} is not in the database`);

  const llmStore = new PostgresLlmCallStore(context.pool, job.id);
  const result = await context.pipeline.runExtraction(thread, {
    llmStore,
    onProgress: async (stage, done, total) => {
      await context.report(job, stage, done, total);
    },
  });

  await context.report(job, "storing", 0, 1);
  const postIds = await postIdsByThreadPostId(context, sourceId);
  await context.topics.updateAnnotations(postIds, result.posts);
  const decisionIds = await context.decisions.saveExtraction({
    topicId,
    result,
    postIds,
  });
  await context.llmCalls.linkJobCallsToDecisions(job.id, decisionIds);

  await context.jobs.enqueue("link", {
    topicId,
    sourceId,
    topicSlug: thread.topic.slug,
    parentJobId: job.id,
  });
}

/** link: attach the decisions to the code they are about. */
export async function handleLink(job: JobRow, context: WorkerContext): Promise<void> {
  if (!context.linker) {
    throw new Error("packages/linker is not available yet - ask Ansh for the link job");
  }
  const sourceId = payloadNumber(job.payload, "sourceId");
  const topicId = payloadNumber(job.payload, "topicId");
  if (sourceId === null || topicId === null) {
    throw new Error("The link job needs a sourceId and a topicId");
  }

  const thread = await context.topics.loadThread(sourceId);
  if (!thread) throw new Error(`Source ${sourceId} is not in the database`);
  const extraction = await context.decisions.loadExtraction(topicId);
  if (!extraction) throw new Error(`Topic ${topicId} has no decisions to link`);

  const postIds = await postIdsByThreadPostId(context, sourceId);

  for (const decision of extraction.result.decisions) {
    await context.report(job, "linking", 0, extraction.result.decisions.length);
    const decisionId = extraction.decisionIds.get(decision.key);
    if (decisionId === undefined) continue;
    const anchors = await context.linker.linkDecision(
      decision,
      thread.posts,
      {
        repoDir: context.cpythonDir,
        repo: "python/cpython",
        githubToken: context.githubToken,
      },
    );
    await context.decisions.saveAnchors(decisionId, anchors, postIds);
  }
}

/** eval: compare what we found with the real PEP. Only the eval step is allowed to read the PEP. */
export async function handleEval(job: JobRow, context: WorkerContext): Promise<void> {
  if (!context.pipeline) {
    throw new Error("packages/pipeline is not available yet - ask Abhijeet for the eval job");
  }
  const topicSlug = payloadString(job.payload, "topicSlug");
  const topic = await context.topics.getBySlug(topicSlug);
  if (!topic) throw new Error(`No topic named ${topicSlug}`);
  if (topic.pep_number === null) {
    throw new Error(`Topic ${topicSlug} has no PEP number, so it cannot be evaluated`);
  }

  const extraction = await context.decisions.loadExtraction(topic.id);
  if (!extraction) throw new Error(`Topic ${topicSlug} has no decisions to evaluate`);

  const llmStore = new PostgresLlmCallStore(context.pool, job.id);
  const result = await context.pipeline.evaluatePep(topic.pep_number, extraction.result, { llmStore });
  await context.evalRuns.save({ topicId: topic.id, result });
}

/** The database id of every post of a source, keyed by the id the post has inside the thread. */
export async function postIdsByThreadPostId(
  context: WorkerContext,
  sourceId: number,
): Promise<Map<string, number>> {
  const result = await context.pool.query<{ id: number; thread_post_id: number | null }>(
    "SELECT id, thread_post_id FROM posts WHERE source_id = $1",
    [sourceId],
  );
  const map = new Map<string, number>();
  for (const row of result.rows) {
    if (row.thread_post_id !== null) map.set(String(row.thread_post_id), row.id);
  }
  return map;
}
