// The two things the PR check route needs from the linker.
//
// Ansh owns packages/linker. When his package is ready the server loads it and these functions
// are used. Until then the API falls back to the simple matcher in simpleMatcher.ts, so the
// route always answers.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { DecisionSummary, PrCheckRequest } from "@dejaview/shared";

export interface PrMatcher {
  matchPr(request: PrCheckRequest, candidates: DecisionSummary[]): DecisionSummary[];
  renderPrComment(
    matches: DecisionSummary[],
    similarRejected: DecisionSummary[],
    dashboardUrl: string,
  ): string;
}

/** Whether packages/linker is on disk at all. */
function linkerIsOnDisk(): boolean {
  return existsSync(fileURLToPath(new URL("../../../packages/linker/", import.meta.url)));
}

/**
 * Tries to use the real linker, and falls back to the simple matcher when it cannot.
 * The two reasons need different fixes, so the reason is passed back with the matcher:
 * the package is on disk and npm has not linked it, or nobody has written it yet.
 * The specifier is kept in a variable so the compiler does not need the package to exist for
 * this file to typecheck.
 */
export async function loadPrMatcher(): Promise<{
  matcher: PrMatcher;
  fromLinker: boolean;
  reason: string;
}> {
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
        reason: "loaded",
      };
    }
  } catch {
    // Fall through to the message below.
  }
  const { simplePrMatcher } = await import("./simpleMatcher.js");
  return {
    matcher: simplePrMatcher,
    fromLinker: false,
    reason: linkerIsOnDisk()
      ? "packages/linker is on disk but not linked - run npm install"
      : "packages/linker is not written yet - ask Ansh for the PR matcher",
  };
}
