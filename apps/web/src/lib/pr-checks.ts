import type { PrCheckView } from "@dejaview/shared";

/** One line saying what the PR check found. */
export function prCheckResult(check: PrCheckView): string {
  if (check.decisionIds.length) {
    return check.decisionIds.length === 1
      ? "1 past decision touches this code"
      : `${check.decisionIds.length} past decisions touch this code`;
  }
  if (check.similarRejectedIds.length) return "Looks like a rejected idea";
  return "No past decisions";
}
