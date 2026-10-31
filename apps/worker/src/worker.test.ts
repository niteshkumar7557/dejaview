// End to end test of the worker chain: ingest -> extract -> link.
//
// The pipeline and the linker belong to Abhijeet and Ansh, so here they are stand-ins that
// return fixed answers. Everything else is the real thing: the real ingest adapter, the real
// database, the real job queue.
//
// These tests skip when DATABASE_URL is not set.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CodeAnchor, ExtractionResult, Thread } from "@dejaview/shared";
import {
  createPool,
  DecisionsRepository,
  EvalRunsRepository,
  IdentityRepository,
  JobsRepository,
  PostgresLlmCallStore,
  TopicsRepository,
  createTestDatabase,
  type TestDatabase,
} from "@dejaview/db";
import type { JobRow } from "@dejaview/db";
import { handleExtract, handleIngest, handleLink, type WorkerContext } from "./handlers.js";
import type { LinkerAdapter, PipelineAdapter } from "./adapters.js";

const databaseUrl = process.env.DATABASE_URL;
const SLUG = "worker-test-topic";

const fakePipeline: PipelineAdapter = {
  async runExtraction(thread: Thread): Promise<ExtractionResult> {
    return {
      topicSlug: thread.topic.slug,
      models: { triage: "qwen3.5:4b", extract: "qwen3.5:9b" },
      posts: thread.posts.map((post) => ({
        postId: post.id,
        bodyClean: post.body,
        signalScore: 1,
        triageLabel: "proposal" as const,
        skipped: false,
      })),
      decisions: [
        {
          key: "d1",
          title: "Keep the list",
          kind: "alternative",
          status: "rejected",
          summary: "Rejected because it breaks old code.",
          confidence: "high",
          decidedAt: "2024-01-02T00:00:00.000Z",
          model: "qwen3.5:9b",
          reasons: [
            {
              text: "it breaks old code",
              evidence: [
                { postId: 1, quote: "A list is simpler.", verified: true, matchScore: 1 },
              ],
            },
          ],
        },
      ],
    };
  },
  async evaluatePep() {
    throw new Error("not used in this test");
  },
};

const fakeLinker: LinkerAdapter = {
  async linkDecision(): Promise<CodeAnchor[]> {
    return [
      {
        repo: "python/cpython",
        symbol: "parse",
        originalPath: "Lib/parser.py",
        originalCommit: "abc123",
        currentPath: "Lib/parser.py",
        relocatedBy: null,
        linkMethod: "path_mention",
        evidencePostId: 1,
      },
    ];
  },
};

describe.skipIf(!databaseUrl)("the worker (needs DATABASE_URL)", () => {
  let pool: ReturnType<typeof createPool>;
  let database: TestDatabase;
  let context: WorkerContext;
  let uploadDir: string;

  beforeAll(async () => {
    database = await createTestDatabase(databaseUrl ?? "", "dejaview_test_worker");
    pool = database.pool;
    uploadDir = mkdtempSync(join(tmpdir(), "dejaview-worker-"));

    const jobs = new JobsRepository(pool);
    context = {
      pool,
      topics: new TopicsRepository(pool),
      decisions: new DecisionsRepository(pool),
      jobs,
      llmCalls: new PostgresLlmCallStore(pool),
      evalRuns: new EvalRunsRepository(pool),
      identities: new IdentityRepository(pool),
      pipeline: { adapter: fakePipeline, problem: "ok", reason: "loaded" },
      linker: { adapter: fakeLinker, problem: "ok", reason: "loaded" },
      cpythonDir: "",
      githubToken: undefined,
      report: async () => {
        // The progress reporting is exercised by the API tests.
      },
    };
  });

  afterAll(async () => {
    await database.drop();
  });

  function writeDiscussion(): string {
    const path = join(uploadDir, "discussion.md");
    writeFileSync(
      path,
      ["Author: alice", "We should use a dict.", "---", "Author: bob", "A list is simpler."].join("\n"),
      "utf8",
    );
    return path;
  }

  /** The queue is first in, first out, so we clear it before we ask for one job. */
  async function drainQueue(): Promise<void> {
    for (;;) {
      const job = await context.jobs.claimNext();
      if (!job) return;
    }
  }

  it("ingests an uploaded discussion and queues the extraction", async () => {
    await drainQueue();
    const filePath = writeDiscussion();
    const job = await context.jobs.enqueue("ingest", {
      filePath,
      topicSlug: SLUG,
      topicTitle: "Worker test topic",
      pepNumber: 998,
    });
    const claimed = await context.jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    await handleIngest(claimed as JobRow, context);

    const topic = await context.topics.getBySlug(SLUG);
    expect(topic).not.toBeNull();
    expect(topic?.pep_number).toBe(998);

    const posts = await context.pool.query<{ author_handle: string }>("SELECT author_handle FROM posts");
    expect(posts.rows.map((row) => row.author_handle)).toEqual(["alice", "bob"]);

    const next = await context.pool.query<{ type: string }>(
      "SELECT type FROM jobs WHERE type = 'extract' AND status = 'queued'",
    );
    expect(next.rows).toHaveLength(1);
  });

  it("remembers who wrote in the thread", async () => {
    await drainQueue();
    const filePath = writeDiscussion();
    const job = await context.jobs.enqueue("ingest", {
      filePath,
      topicSlug: SLUG,
      topicTitle: "Worker test topic",
      pepNumber: 998,
    });
    const claimed = await context.jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    await handleIngest(claimed as JobRow, context);

    const found = await context.identities.findByHandle("unknown", "alice");
    expect(found).not.toBeNull();
    expect(found?.personId).toBeGreaterThan(0);
  });

  it("runs the extraction and stores the decisions", async () => {
    await drainQueue();
    const sourceId = await sourceIdOf(SLUG);
    const job = await context.jobs.enqueue("extract", {
      topicId: await topicIdOf(SLUG),
      sourceId,
      topicSlug: SLUG,
    });
    const claimed = await context.jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    await handleExtract(claimed as JobRow, context);

    const decisions = await context.decisions.search({ q: "breaks old code" });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.status).toBe("rejected");
    expect(decisions[0]?.verifiedEvidence).toBe(1);

    // The evidence points at the real post row.
    const evidence = await context.pool.query<{ post_id: number | null }>(
      "SELECT post_id FROM evidence",
    );
    expect(evidence.rows[0]?.post_id).toBeGreaterThan(0);

    const next = await context.pool.query<{ type: string }>(
      "SELECT type FROM jobs WHERE type = 'link' AND status = 'queued'",
    );
    expect(next.rows).toHaveLength(1);
  });

  it("links the decisions to the code", async () => {
    await drainQueue();
    const sourceId = await sourceIdOf(SLUG);
    const job = await context.jobs.enqueue("link", {
      topicId: await topicIdOf(SLUG),
      sourceId,
      topicSlug: SLUG,
    });
    const claimed = await context.jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    await handleLink(claimed as JobRow, context);

    const anchors = await context.pool.query<{ original_path: string; link_method: string }>(
      "SELECT original_path, link_method FROM code_anchors",
    );
    expect(anchors.rows).toHaveLength(1);
    expect(anchors.rows[0]?.original_path).toBe("Lib/parser.py");
    expect(anchors.rows[0]?.link_method).toBe("path_mention");
  });

  it("says clearly when the pipeline package is not there yet", async () => {
    await drainQueue();
    const job = await context.jobs.enqueue("extract", {
      topicId: await topicIdOf(SLUG),
      sourceId: await sourceIdOf(SLUG),
      topicSlug: SLUG,
    });
    const claimed = await context.jobs.claimNext();
    const withoutPipeline = {
      ...context,
      pipeline: {
        adapter: null,
        problem: "not-published" as const,
        reason: "packages/pipeline is not written yet",
      },
    };
    await expect(handleExtract(claimed as JobRow, withoutPipeline)).rejects.toThrow(
      /pipeline is not written yet/,
    );
  });

  it("says clearly when the linker package is not there yet", async () => {
    await drainQueue();
    const job = await context.jobs.enqueue("link", {
      topicId: await topicIdOf(SLUG),
      sourceId: await sourceIdOf(SLUG),
      topicSlug: SLUG,
    });
    const claimed = await context.jobs.claimNext();
    const withoutLinker = {
      ...context,
      linker: {
        adapter: null,
        problem: "not-published" as const,
        reason: "packages/linker is not written yet",
      },
    };
    await expect(handleLink(claimed as JobRow, withoutLinker)).rejects.toThrow(
      /linker is not written yet/,
    );
  });

  it("puts a job back in the queue when it is only waiting for a package", async () => {
    await drainQueue();
    const job = await context.jobs.enqueue("extract", {
      topicId: await topicIdOf(SLUG),
      sourceId: await sourceIdOf(SLUG),
      topicSlug: SLUG,
    });
    const claimed = await context.jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    // This is what the worker does when a package it needs is not there yet.
    await context.jobs.requeue(job.id, claimed?.attempt ?? 0, "packages/pipeline is not written yet", 60);

    const row = await context.jobs.getById(job.id);
    expect(row?.status).toBe("queued");
    expect(row?.error).toBe("packages/pipeline is not written yet");

    // It waits for its turn and is not claimed straight away.
    expect(await context.jobs.claimNext()).toBeNull();
  });

  async function topicIdOf(slug: string): Promise<number> {
    const topic = await context.topics.getBySlug(slug);
    if (!topic) throw new Error(`no topic ${slug}`);
    return topic.id;
  }

  async function sourceIdOf(slug: string): Promise<number> {
    const result = await context.pool.query<{ id: number }>(
      "SELECT s.id FROM sources s JOIN topics t ON t.id = s.topic_id WHERE t.slug = $1",
      [slug],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) throw new Error(`no source for ${slug}`);
    return id;
  }
});
