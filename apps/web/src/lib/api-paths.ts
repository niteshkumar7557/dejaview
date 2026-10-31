// URL paths for every route in packages/shared/src/api.ts.
import type { DecisionQuery } from "./data-source";

export const TOPICS_PATH = "/api/topics";
export const EVAL_PATH = "/api/eval";
export const PR_CHECKS_PATH = "/api/pr-checks";
export const INGEST_PATH = "/api/ingest";

export function topicPath(slug: string): string {
  return `${TOPICS_PATH}/${encodeURIComponent(slug)}`;
}

export function timelinePath(slug: string): string {
  return `${topicPath(slug)}/timeline`;
}

export function decisionsPath(query: DecisionQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.status) params.set("status", query.status);
  if (query.topic) params.set("topic", query.topic);
  if (query.verified !== undefined) params.set("verified", String(query.verified));
  const search = params.toString();
  return search ? `/api/decisions?${search}` : "/api/decisions";
}

export function decisionPath(id: number): string {
  return `/api/decisions/${id}`;
}

export function llmCallsPath(id: number): string {
  return `${decisionPath(id)}/llm-calls`;
}

export function evalStartPath(slug: string): string {
  return `${EVAL_PATH}/${encodeURIComponent(slug)}`;
}

export function jobPath(id: number): string {
  return `/api/jobs/${id}`;
}
