import { DECISION_STATUSES, type DecisionStatus } from "@dejaview/shared";
import type { DecisionQuery } from "./data-source";

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** URL search params (from a GET form or a link) → a DecisionQuery with only valid, non-empty filters. */
export function parseDecisionQuery(raw: Raw): DecisionQuery {
  const query: DecisionQuery = {};
  const q = first(raw.q);
  const status = first(raw.status);
  const topic = first(raw.topic);
  const verified = first(raw.verified);
  if (q) query.q = q;
  if (status && (DECISION_STATUSES as readonly string[]).includes(status)) query.status = status as DecisionStatus;
  if (topic) query.topic = topic;
  if (verified === "on" || verified === "true") query.verified = true;
  return query;
}
