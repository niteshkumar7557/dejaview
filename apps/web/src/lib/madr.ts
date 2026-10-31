// Renders a decision as a MADR (Markdown Architectural Decision Record) file, so recovered
// decisions can be dropped into a project's docs/decisions/ and used with existing ADR tools.

import type { DecisionCard } from "@dejaview/shared";
import { formatDate } from "./format";

const STATUS_WORD = { accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn", open: "Open" } as const;

export function renderMadr(card: DecisionCard, dashboardUrl: string): string {
  const source = card.topic.pepNumber !== null ? `${card.topic.title} (PEP ${card.topic.pepNumber})` : card.topic.title;
  const lines: string[] = [
    `# ${card.title}`,
    "",
    `* Status: ${card.status}`,
    `* Decided: ${formatDate(card.decidedAt)}`,
    `* Source: ${source}`,
    `* Recovered by: DejaView (${card.model})`,
    "",
    "## Context and Problem Statement",
    "",
    card.summary,
    "",
    "## Decision Outcome",
    "",
    `${STATUS_WORD[card.status]}: ${card.title}.`,
    "",
    "### Reasons",
    "",
  ];
  for (const reason of card.reasons) {
    lines.push(`* ${reason.text}`);
    for (const e of reason.evidence) {
      const where = [e.author, formatDate(e.createdAt), e.verified ? "verified" : "unverified"].join(", ");
      lines.push(`  * "${e.quote}" (${where})${e.postUrl ? ` ${e.postUrl}` : ""}`);
    }
  }
  lines.push("", "## Links", "");
  for (const a of card.anchors) {
    const path = a.currentPath ?? a.originalPath;
    const symbol = a.symbol ? ` (${a.symbol})` : "";
    const gone = a.currentPath === null ? ", not found at HEAD" : "";
    lines.push(`* Code: \`${path}\`${symbol}, linked by ${a.linkMethod}${gone}`);
  }
  lines.push(`* DejaView: ${dashboardUrl.replace(/\/+$/, "")}/decisions/${card.id}`, "");
  return lines.join("\n");
}

export function madrFileName(card: DecisionCard): string {
  const words = card.title.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 6);
  return `${card.topic.slug}-d${card.id}-${words.join("-")}.md`;
}
