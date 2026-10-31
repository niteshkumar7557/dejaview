import { prChecks } from "../mocks/dataset";
import {
  allDecisions,
  allEvalRuns,
  allTopicSlugs,
  llmCallsFor,
  timeline,
  toDecisionCard,
  toDecisionSummary,
  toTopicDetail,
  toTopicSummary,
} from "../mocks/views";
import type { DataSource } from "./data-source";
import { mockEvalJobAt, mockJobAt } from "./mock-job";
import { fullyVerified } from "./verified";

/** DataSource over the sample dataset. Jobs are simulated from the time they were started. */
export function createMockSource(now: () => number = Date.now): DataSource {
  // Job id → when it started and what it simulates.
  const jobs = new Map<number, { startedAt: number; kind: "ingest" | "eval" }>();
  let nextJobId = 1;

  function start(kind: "ingest" | "eval", topicSlug: string) {
    const jobId = nextJobId++;
    jobs.set(jobId, { startedAt: now(), kind });
    return { jobId, topicSlug };
  }

  return {
    listTopics: async () => allTopicSlugs().map(toTopicSummary),
    getTopic: async (slug) => toTopicDetail(slug),
    getTimeline: async (slug) => timeline(slug),
    async searchDecisions({ q, status, topic, verified }) {
      const needle = q?.trim().toLowerCase();
      return allDecisions()
        .map(toDecisionSummary)
        .filter((d) => !status || d.status === status)
        .filter((d) => !topic || d.topic.slug === topic)
        .filter((d) => !verified || fullyVerified(d))
        .filter((d) => !needle || `${d.title} ${d.reasons.join(" ")}`.toLowerCase().includes(needle));
    },
    getDecision: async (id) => toDecisionCard(id),
    getLlmCalls: async (id) => llmCallsFor(id),
    listEvalRuns: async () => allEvalRuns(),
    listPrChecks: async () => prChecks,
    async getJob(id) {
      const job = jobs.get(id);
      if (!job) return null;
      const at = job.kind === "eval" ? mockEvalJobAt : mockJobAt;
      return at(now() - job.startedAt, id, job.startedAt);
    },
    startIngest: async (request) => start("ingest", request.topicSlug),
    async startIngestUpload(form) {
      const slug = form.get("topicSlug");
      if (typeof slug !== "string" || !slug.trim()) throw new Error("topicSlug is required when uploading a file");
      if (!(form.get("file") instanceof Blob)) throw new Error("Choose a file to upload.");
      return start("ingest", slug.trim());
    },
    async startEval(slug) {
      if (!toTopicDetail(slug)) throw new Error(`No topic named ${slug}`);
      return start("eval", slug);
    },
  };
}
