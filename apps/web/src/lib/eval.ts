import type { EvalMatch, EvalResult, ReasonAgreement } from "@dejaview/shared";

/** "d12" → 12. Decision keys come from the pipeline's ExtractedDecision.key. */
export function decisionIdFromKey(key: string | null): number | null {
  const match = key ? /^d(\d+)$/.exec(key) : null;
  return match ? Number(match[1]) : null;
}

export function agreementText(agreement: ReasonAgreement | null): string {
  switch (agreement) {
    case "yes": return "Yes";
    case "partial": return "Partly";
    case "no": return "No";
    default: return "—"; // taste-skill-ignore: missing-value mark
  }
}

export function matchedCount(run: EvalResult): number {
  return run.matches.filter((m) => m.decisionKey !== null).length;
}

/** An eval match, plus the database id of the decision once the API sends it (asked of Mudit). */
export type EvalMatchWithId = EvalMatch & { decisionId?: number | null };

/**
 * The decision an eval match points at, only if it belongs to the run's own discussion.
 *
 * EvalMatch.decisionKey is ExtractedDecision.key: unique within one extraction run, not a database id.
 * A `decisionId` on the match is used when present. Otherwise the key is read as "d<id>" only when
 * `keysAreIds` says that holds (the sample dataset); against the real API a key like "d3" says nothing
 * about database row 3, and a wrong link is worse than none.
 */
export function resolveMatch(
  match: EvalMatchWithId,
  topicSlug: string,
  decisions: { id: number; title: string; topic: { slug: string } }[],
  keysAreIds: boolean,
): { id: number; title: string } | null {
  if (match.decisionKey === null) return null;
  const id = typeof match.decisionId === "number"
    ? match.decisionId
    : keysAreIds ? decisionIdFromKey(match.decisionKey) : null;
  const decision = id === null ? undefined : decisions.find((d) => d.id === id && d.topic.slug === topicSlug);
  return decision ? { id: decision.id, title: decision.title } : null;
}
