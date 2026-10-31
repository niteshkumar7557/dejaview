// A small matcher used until packages/linker exists.
//
// It does the obvious thing: a decision matches when the pull request touches a file the
// decision is linked to, or mentions a symbol the decision is linked to. The real matcher
// (Ansh's) also follows renames and looks at the diff, and it replaces this file as soon as
// @dejaview/linker is published - see prMatcher.ts.

import type { DecisionSummary, PrCheckRequest } from "@dejaview/shared";
import type { PrMatcher } from "./prMatcher.js";

function matchesOne(request: PrCheckRequest, summary: DecisionSummary): boolean {
  const changedPaths = new Set(request.files.map((file) => file.path));
  const renamedPaths = new Set(
    request.files.map((file) => file.previousPath).filter((path): path is string => Boolean(path)),
  );

  for (const anchor of summary.anchors) {
    if (anchor.currentPath && changedPaths.has(anchor.currentPath)) return true;
    if (anchor.originalPath && (changedPaths.has(anchor.originalPath) || renamedPaths.has(anchor.originalPath))) {
      return true;
    }
    if (anchor.symbol && request.symbols.includes(anchor.symbol)) return true;
  }
  return false;
}

export const simplePrMatcher: PrMatcher = {
  matchPr(request, candidates) {
    return candidates.filter((candidate) => matchesOne(request, candidate));
  },

  renderPrComment(matches, similarRejected, dashboardUrl) {
    const lines: string[] = ["<!-- dejaview -->", "## 📜 DejaView check"];
    if (matches.length === 0 && similarRejected.length === 0) {
      lines.push("", "No past decisions touch this code.");
      return lines.join("\n");
    }
    if (matches.length > 0) {
      lines.push("", `**${matches.length} past decision(s) touch this code**`, "");
      for (const match of matches) {
        lines.push(`- **${match.title}** — ${match.status}`);
        for (const reason of match.reasons) {
          lines.push(`  - Why: ${reason}`);
        }
        if (match.anchors.length > 0) {
          const paths = match.anchors.map((anchor) => anchor.currentPath ?? anchor.originalPath);
          lines.push(`  - Linked via: ${paths.map((path) => `\`${path}\``).join(", ")}`);
        }
      }
    }
    if (similarRejected.length > 0) {
      lines.push("", `**⚠️ ${similarRejected.length} previously rejected idea(s) look similar**`, "");
      for (const similar of similarRejected) {
        lines.push(`- ${similar.title} — ${similar.reasons[0] ?? ""}`);
      }
    }
    if (dashboardUrl) {
      lines.push("", `[See the full decision in DejaView](${dashboardUrl})`);
    }
    return lines.join("\n");
  },
};
