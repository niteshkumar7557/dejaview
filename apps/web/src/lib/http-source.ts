import type { ApiError, DecisionSummary, IngestResponse } from "@dejaview/shared";
import {
  decisionPath,
  decisionsPath,
  EVAL_PATH,
  evalStartPath,
  INGEST_PATH,
  jobPath,
  llmCallsPath,
  PR_CHECKS_PATH,
  timelinePath,
  TOPICS_PATH,
  topicPath,
} from "./api-paths";
import type { DataSource } from "./data-source";
import { fullyVerified } from "./verified";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const TIMEOUT_MS = 10_000;

/** DataSource over Mudit's Express API. 404 → null; any other non-2xx → ApiRequestError. */
export function createHttpSource(baseUrl: string, fetchImpl: typeof fetch = fetch): DataSource {
  const base = baseUrl.replace(/\/+$/, "");

  async function request<T>(path: string, init?: RequestInit): Promise<T | null> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
      // Network failure, DNS, refused connection or timeout: status 0 means "never reached the API".
      throw new ApiRequestError(0, "Couldn't reach the DejaView API");
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as ApiError | null;
      throw new ApiRequestError(response.status, body?.error ?? `Request failed with ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function list<T>(path: string): Promise<T[]> {
    return (await request<T[]>(path)) ?? [];
  }

  /** A POST that queues a job. A 404 here means the route or the topic is missing, which is an error. */
  async function startJob(path: string, init: RequestInit, missing: string): Promise<IngestResponse> {
    const result = await request<IngestResponse>(path, { ...init, method: "POST" });
    if (!result) throw new ApiRequestError(404, missing);
    return result;
  }

  return {
    listTopics: () => list(TOPICS_PATH),
    getTopic: (slug) => request(topicPath(slug)),
    getTimeline: (slug) => request(timelinePath(slug)),
    async searchDecisions(query) {
      const found = await list<DecisionSummary>(decisionsPath(query));
      // The API's verified=true keeps decisions with at least one verified quote; the dashboard's filter
      // promises every quote verified, so narrow it here.
      return query.verified ? found.filter(fullyVerified) : found;
    },
    getDecision: (id) => request(decisionPath(id)),
    getLlmCalls: (id) => list(llmCallsPath(id)),
    listEvalRuns: () => list(EVAL_PATH),
    listPrChecks: () => list(PR_CHECKS_PATH),
    getJob: (id) => request(jobPath(id)),
    startIngest: (body) =>
      startJob(INGEST_PATH, {
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }, "Ingest endpoint not found"),
    // No content-type header: fetch sets multipart/form-data with the boundary itself.
    startIngestUpload: (form) => startJob(INGEST_PATH, { body: form }, "Ingest endpoint not found"),
    startEval: (slug) => startJob(evalStartPath(slug), {}, `No topic named ${slug}`),
  };
}
