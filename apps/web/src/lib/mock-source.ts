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
import { mockJobAt } from "./mock-job";

/** DataSource over the sample dataset. Jobs are simulated from the time they were started. */
export function createMockSource(now: () => number = Date.now): DataSource {
  const jobs = new Map<number, number>();
  let nextJobId = 1;

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
        .filter((d) => !verified || d.verifiedEvidence === d.totalEvidence)
        .filter((d) => !needle || `${d.title} ${d.reasons.join(" ")}`.toLowerCase().includes(needle));
    },
    getDecision: async (id) => toDecisionCard(id),
    getLlmCalls: async (id) => llmCallsFor(id),
    listEvalRuns: async () => allEvalRuns(),
    listPrChecks: async () => prChecks,
    async getJob(id) {
      const startedAt = jobs.get(id);
      return startedAt === undefined ? null : mockJobAt(now() - startedAt, id, startedAt);
    },
    async startIngest(request) {
      const jobId = nextJobId++;
      jobs.set(jobId, now());
      return { jobId, topicSlug: request.topicSlug };
    },
  };
}
