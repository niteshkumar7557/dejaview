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
