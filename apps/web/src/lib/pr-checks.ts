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

/** The check chosen with ?pr=<id>, or the first one. */
export function selectCheck(checks: PrCheckView[], param: string | undefined): PrCheckView | null {
  return checks.find((c) => String(c.id) === param) ?? checks[0] ?? null;
}

/** The comment as a reader sees it on GitHub: without the bot's hidden update marker. */
export function commentBody(markdown: string): string {
  return markdown.replace(/<!--\s*dejaview\s*-->\s*/g, "").trim();
}
