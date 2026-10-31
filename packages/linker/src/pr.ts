import type { DecisionSummary, PrCheckRequest } from "@dejaview/shared";

const MIN_SHARED_TERMS = 2;
const MIN_CANDIDATE_COVERAGE = 0.3;
const STOP_WORDS = new Set([
  "about", "after", "again", "against", "all", "also", "and", "any", "are", "because", "been", "before", "being", "between",
  "but", "can", "could", "does", "each", "for", "from", "had", "has", "have", "into", "its", "more", "most", "not", "our",
  "out", "over", "same", "should", "some", "such", "than", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "those", "through", "under", "use", "using", "was", "were", "what", "when", "where", "which", "while", "with", "would",
]);

/** Match accepted decisions by code overlap and rejected decisions by lexical proposal similarity. */
export function matchPr(req: PrCheckRequest, candidates: DecisionSummary[]): DecisionSummary[] {
  const changedPaths = new Set((req.files ?? []).flatMap((file) => [file.path, file.previousPath])
    .filter((filePath): filePath is string => typeof filePath === "string" && filePath.length > 0)
    .map(normalizePath));
  const changedSymbols = new Set((req.symbols ?? []).filter((symbol): symbol is string => typeof symbol === "string").map((symbol) => symbol.trim()).filter(Boolean));
  const requestTerms = tokenize(`${safeString(req.title)} ${safeString(req.body)}`);
  const seen = new Set<number>();
  const matches: DecisionSummary[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.id)) continue;
    const relevant = candidate.status === "accepted"
      ? hasCodeOverlap(candidate, changedPaths, changedSymbols)
      : candidate.status === "rejected" && hasLexicalSimilarity(candidate, requestTerms);
    if (relevant) {
      seen.add(candidate.id);
      matches.push(candidate);
    }
  }

  return matches;
}

/** Render deterministic GitHub Markdown from structured decision summaries. */
export function renderPrComment(
  matches: DecisionSummary[],
  similarRejected: DecisionSummary[],
  dashboardUrl: string,
): string {
  const accepted = uniqueById(matches).filter((decision) => decision.status === "accepted");
  const rejected = uniqueById(similarRejected).filter((decision) => decision.status === "rejected");
  const total = accepted.length + rejected.length;
  const lines = [
    "<!-- dejaview -->",
    "",
    total > 0
      ? `**📜 DejaView check — ${total} past decision${total === 1 ? "" : "s"} ${total === 1 ? "touches" : "touch"} this code or proposal**`
      : "**📜 DejaView check**",
    "",
    "Historical context is informational; it does not automatically reject this pull request.",
    "",
    "### Related accepted architectural decisions",
    "",
  ];

  if (accepted.length === 0) {
    lines.push("No related accepted decisions were found.", "");
  } else {
    for (const decision of accepted) lines.push(...renderAcceptedDecision(decision, dashboardUrl), "");
  }

  lines.push("### Previously rejected similar proposals", "");
  if (rejected.length === 0) {
    lines.push("No similar previously rejected proposals were found.", "");
  } else {
    for (const decision of rejected) lines.push(...renderRejectedDecision(decision, dashboardUrl), "");
  }

  const dashboardLink = safeDashboardLink(dashboardUrl);
  if (dashboardLink) lines.push(`[Open the DejaView dashboard](<${dashboardLink}>)`);
  else lines.push("Open the DejaView dashboard for the full decision history.");

  return lines.join("\n").trimEnd();
}

function hasCodeOverlap(candidate: DecisionSummary, changedPaths: Set<string>, changedSymbols: Set<string>): boolean {
  for (const anchor of candidate.anchors ?? []) {
    if (anchor.currentPath && changedPaths.has(normalizePath(anchor.currentPath))) return true;
    if (anchor.originalPath && changedPaths.has(normalizePath(anchor.originalPath))) return true;
    if (anchor.symbol && changedSymbols.has(anchor.symbol.trim())) return true;
  }
  return false;
}

function hasLexicalSimilarity(candidate: DecisionSummary, requestTerms: Set<string>): boolean {
  if (requestTerms.size === 0) return false;
  const candidateTerms = tokenize(`${safeString(candidate.title)} ${(candidate.reasons ?? []).join(" ")}`);
  if (candidateTerms.size === 0) return false;
  let sharedTerms = 0;
  for (const term of candidateTerms) if (requestTerms.has(term)) sharedTerms += 1;
  return sharedTerms >= MIN_SHARED_TERMS && sharedTerms / candidateTerms.size >= MIN_CANDIDATE_COVERAGE;
}

function tokenize(value: string): Set<string> {
  return new Set((value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_]{3,}/gu) ?? [])
    .filter((token) => !STOP_WORDS.has(token)));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "").replace(/\/{2,}/g, "/");
}

function renderAcceptedDecision(decision: DecisionSummary, dashboardUrl: string): string[] {
  const title = `${topicLabel(decision)} · ACCEPTED: ${escapeMarkdown(decision.title)}`;
  const lines = [`**${linkTitle(title, decision, dashboardUrl)}**`];
  const reasons = (decision.reasons ?? []).filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
  if (reasons.length > 0) lines.push(`Why: ${reasons.map(escapeMarkdown).join("; ")}`);

  const paths = uniqueAnchorPaths(decision);
  if (paths.length > 0) {
    lines.push(`Linked via: ${paths.map(({ current, original }) => original && current && original !== current
      ? `${codeSpan(current)} (renamed from ${codeSpan(original)})`
      : codeSpan(current ?? original ?? "")).join(", ")}`);
  }
  const decisionUrl = safeDecisionLink(dashboardUrl, decision.id);
  lines.push(decisionUrl ? `Evidence and source links: [view decision](<${decisionUrl}>)` : "Evidence and source links are available in the DejaView dashboard.");
  return lines;
}

function renderRejectedDecision(decision: DecisionSummary, dashboardUrl: string): string[] {
  const topic = topicLabel(decision);
  const title = escapeMarkdown(decision.title);
  const reasons = (decision.reasons ?? []).filter((reason): reason is string => typeof reason === "string" && reason.trim().length > 0);
  const reasonText = reasons.length > 0 ? reasons.map(escapeMarkdown).join("; ") : "No rationale is available in this summary.";
  const suffix = topic ? ` (${topic})` : "";
  const lines = [`⚠️ This looks similar to a **previously rejected idea**: “${title}”${suffix}. Reason: ${reasonText}`];
  const decisionUrl = safeDecisionLink(dashboardUrl, decision.id);
  lines.push(decisionUrl ? `[View source discussion and decision](<${decisionUrl}>)` : "Source discussion and decision details are available in the DejaView dashboard.");
  return lines;
}

function topicLabel(decision: DecisionSummary): string {
  if (decision.topic?.pepNumber != null) return `PEP ${decision.topic.pepNumber}`;
  return escapeMarkdown(decision.topic?.title || decision.topic?.slug || "Historical decision");
}

function linkTitle(title: string, decision: DecisionSummary, dashboardUrl: string): string {
  const url = safeDecisionLink(dashboardUrl, decision.id);
  return url ? `[${title}](<${url}>)` : title;
}

function uniqueAnchorPaths(decision: DecisionSummary): Array<{ current: string | null; original: string | null }> {
  const seen = new Set<string>();
  const paths: Array<{ current: string | null; original: string | null }> = [];
  for (const anchor of decision.anchors ?? []) {
    const current = anchor.currentPath || null;
    const original = anchor.originalPath || null;
    const key = `${current ?? ""}\0${original ?? ""}`;
    if (seen.has(key) || (!current && !original)) continue;
    seen.add(key);
    paths.push({ current, original });
  }
  return paths;
}

function safeDecisionLink(base: string, id: number): string | null {
  const root = safeDashboardLink(base);
  if (!root || !Number.isSafeInteger(id) || id < 0) return null;
  const url = new URL(root);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/decisions/${id}`;
  url.search = "";
  return url.toString();
}

function safeDashboardLink(value: string): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function escapeMarkdown(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/([\\`*_{}\[\]()#+\-.!|])/g, "\\$1").replace(/[\r\n]+/g, " ");
}

function codeSpan(value: string): string {
  const text = value.replace(/[\r\n]+/g, " ");
  const ticks = Math.max(1, ...Array.from(text.matchAll(/`+/g), (match) => match[0].length + 1));
  const delimiter = "`".repeat(ticks);
  return `${delimiter}${text}${delimiter}`;
}

function uniqueById(decisions: DecisionSummary[]): DecisionSummary[] {
  const seen = new Set<number>();
  return decisions.filter((decision) => {
    if (seen.has(decision.id)) return false;
    seen.add(decision.id);
    return true;
  });
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
