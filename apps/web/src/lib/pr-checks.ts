import type { PrCheckView } from "@dejaview/shared";

/**
 * One line saying what the PR check found. The linker's matches are accepted decisions whose code the
 * PR touches and rejected ones that resemble its proposal, so "related", not "touches this code".
 */
export function prCheckResult(check: PrCheckView): string {
  if (check.decisionIds.length) {
    // Count the rejected look-alikes too: the comment shows them, so the list should not say fewer.
    const related = new Set([...check.decisionIds, ...check.similarRejectedIds]).size;
    return related === 1 ? "1 related past decision" : `${related} related past decisions`;
  }
  if (check.similarRejectedIds.length) return "Looks like a rejected idea";
  return "No past decisions";
}

/** The PR's title, or "repo#number" when the API has none (it does not store titles yet). */
export function prTitle(check: Pick<PrCheckView, "request">): string {
  const { repo, prNumber, title } = check.request;
  return title.trim() || `${repo}#${prNumber}`;
}

/** The check chosen with ?pr=<id>, or the first one. */
export function selectCheck(checks: PrCheckView[], param: string | undefined): PrCheckView | null {
  return checks.find((c) => String(c.id) === param) ?? checks[0] ?? null;
}

/** The comment as a reader sees it on GitHub: without the bot's hidden update marker. */
export function commentBody(markdown: string): string {
  return markdown.replace(/<!--\s*dejaview\s*-->\s*/g, "").trim();
}
