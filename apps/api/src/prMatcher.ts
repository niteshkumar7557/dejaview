// The two things the PR check route needs from the linker.
//
// Ansh owns packages/linker. When his package is ready the server loads it and these functions
// are used. Until then the API falls back to the simple matcher in simpleMatcher.ts, so the
// route always answers.

import type { DecisionSummary, PrCheckRequest } from "@dejaview/shared";

export interface PrMatcher {
  matchPr(request: PrCheckRequest, candidates: DecisionSummary[]): DecisionSummary[];
  renderPrComment(
    matches: DecisionSummary[],
    similarRejected: DecisionSummary[],
    dashboardUrl: string,
  ): string;
}

/**
 * Tries to use the real linker, and falls back to the simple matcher when the package is not
 * there yet. The specifier is kept in a variable so the compiler does not need the package to
 * exist for this file to typecheck.
 */
export async function loadPrMatcher(): Promise<{ matcher: PrMatcher; fromLinker: boolean }> {
  const specifier = "@dejaview/linker";
  try {
    const module = (await import(specifier)) as {
      matchPr?: PrMatcher["matchPr"];
      renderPrComment?: PrMatcher["renderPrComment"];
    };
    if (module.matchPr && module.renderPrComment) {
      return {
        matcher: { matchPr: module.matchPr, renderPrComment: module.renderPrComment },
        fromLinker: true,
      };
    }
  } catch {
    // The linker package is not there yet.
  }
  const { simplePrMatcher } = await import("./simpleMatcher.js");
  return { matcher: simplePrMatcher, fromLinker: false };
}
