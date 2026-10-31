import type { EvalResult, ReasonAgreement } from "@dejaview/shared";

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

/**
 * The decision an eval match points at, only if it belongs to the run's own discussion.
 * EvalMatch.decisionKey is ExtractedDecision.key, unique within one extraction run, not a database id;
 * until the contract carries a decision id, a key that resolves to another discussion is not linked.
 */
export function resolveMatch(
  key: string | null,
  topicSlug: string,
  decisions: { id: number; title: string; topic: { slug: string } }[],
): { id: number; title: string } | null {
  const id = decisionIdFromKey(key);
  const decision = id === null ? undefined : decisions.find((d) => d.id === id && d.topic.slug === topicSlug);
  return decision ? { id: decision.id, title: decision.title } : null;
}
