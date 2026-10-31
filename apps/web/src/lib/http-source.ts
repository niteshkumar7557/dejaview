import type { ApiError } from "@dejaview/shared";
import {
  decisionPath,
  decisionsPath,
  EVAL_PATH,
  INGEST_PATH,
  jobPath,
  llmCallsPath,
  PR_CHECKS_PATH,
  timelinePath,
  TOPICS_PATH,
  topicPath,
} from "./api-paths";
import type { DataSource } from "./data-source";

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

  return {
    listTopics: () => list(TOPICS_PATH),
    getTopic: (slug) => request(topicPath(slug)),
    getTimeline: (slug) => request(timelinePath(slug)),
    searchDecisions: (query) => list(decisionsPath(query)),
    getDecision: (id) => request(decisionPath(id)),
    getLlmCalls: (id) => list(llmCallsPath(id)),
    listEvalRuns: () => list(EVAL_PATH),
    listPrChecks: () => list(PR_CHECKS_PATH),
    getJob: (id) => request(jobPath(id)),
    async startIngest(body) {
      const result = await request<Awaited<ReturnType<DataSource["startIngest"]>>>(INGEST_PATH, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!result) throw new ApiRequestError(404, "Ingest endpoint not found");
      return result;
    },
  };
}
