import type { ThreadPost } from "@dejaview/shared";

/** A textual reference found in a post body, with half-open character offsets. */
interface ReferenceLocation {
  start: number;
  end: number;
  text: string;
}

type ReferenceData =
  | { type: "issue"; prefix: "gh" | "bpo"; number: number }
  | { type: "repository"; repository: string; number: number }
  | { type: "github_url"; repository: string; referenceType: "pull" | "issues"; number: number }
  | { type: "commit"; sha: string }
  | { type: "path"; path: string }
  | { type: "symbol"; symbol: string };

export type Reference = ReferenceLocation & ReferenceData;

const SOURCE_PATH = /\b(?:Lib|Objects|Modules|Include|Python|Parser|Programs|Tools|Misc|PC|Mac|iOS|Android)\/[A-Za-z0-9_.+/-]+\.(?:pyi?|pxd|pxi|c|h|cc|cpp|cxx|hpp|inc|rst|toml|json|txt)\b/g;
const GITHUB_URL = /https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/(pull|issues)\/(\d+)\b/gi;
const REPOSITORY_REF = /\b(python\/cpython)\s*#\s*(\d+)\b/gi;
const ISSUE_REF = /\b(gh|bpo)-(\d+)\b/gi;
const COMMIT = /\b(?=[a-f\d]{7,40}\b)(?=[a-f\d]*[a-f])(?=[a-f\d]*\d)[a-f\d]{7,40}\b/gi;
const BACKTICK = /`([^`\n]+)`/g;
const QUALIFIED_SYMBOL = /\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)+\b/g;
const IDENTIFIER = /\b(?:Py[A-Z][A-Za-z0-9_]*|[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9_]*)+)\b/g;

/** Extract explicit GitHub, commit, CPython path, and code-symbol references from a post body. */
export function findReferences(post: ThreadPost): Reference[] {
  if (!post || typeof post.body !== "string" || post.body.length === 0) return [];

  const body = post.body;
  const found: Reference[] = [];
  const occupied: Array<{ start: number; end: number }> = [];
  const add = (item: Reference): void => {
    if (occupied.some(({ start, end }) => item.start < end && item.end > start)) return;
    found.push(item);
    occupied.push({ start: item.start, end: item.end });
  };

  const scan = (pattern: RegExp, make: (match: RegExpExecArray) => ReferenceData): void => {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(body)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (pattern === SOURCE_PATH && body[start - 1] === "/") continue;
      add({ ...make(match), start, end, text: match[0] });
    }
  };

  scan(GITHUB_URL, (m) => ({ type: "github_url", repository: m[1]!, referenceType: m[2]!.toLowerCase() as "pull" | "issues", number: Number(m[3]) }));
  scan(REPOSITORY_REF, (m) => ({ type: "repository", repository: m[1]!, number: Number(m[2]) }));
  scan(ISSUE_REF, (m) => ({ type: "issue", prefix: m[1]!.toLowerCase() as "gh" | "bpo", number: Number(m[2]) }));
  scan(SOURCE_PATH, (m) => ({ type: "path", path: m[0] }));
  scan(COMMIT, (m) => ({ type: "commit", sha: m[0].toLowerCase() }));

  // Symbols are deliberately restricted to backticks, which avoids treating prose as code.
  BACKTICK.lastIndex = 0;
  let tick: RegExpExecArray | null;
  while ((tick = BACKTICK.exec(body)) !== null) {
    const content = tick[1]!;
    const offset = tick.index + 1;
    // A path or a non-identifier inline-code fragment is not also a symbol.
    if (SOURCE_PATH.test(content)) {
      SOURCE_PATH.lastIndex = 0;
      continue;
    }
    SOURCE_PATH.lastIndex = 0;
    const symbolPattern = /^(?:[A-Za-z_][A-Za-z0-9_]*\.)*[A-Za-z_][A-Za-z0-9_]*$/;
    if (!symbolPattern.test(content)) continue;
    const start = offset;
    add({ type: "symbol", symbol: content, start, end: start + content.length, text: content });
  }

  // Qualified names can be useful even when authors omit Markdown backticks.
  scan(QUALIFIED_SYMBOL, (m) => ({ type: "symbol", symbol: m[0] }));

  // Also retain common C API/type symbols written without backticks.
  scan(IDENTIFIER, (m) => ({ type: "symbol", symbol: m[0] }));

  return deduplicate(found).sort((a, b) => a.start - b.start || a.end - b.end || a.type.localeCompare(b.type));
}

function deduplicate(references: Reference[]): Reference[] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const value = "symbol" in reference ? reference.symbol
      : "path" in reference ? reference.path
        : "sha" in reference ? reference.sha
          : "repository" in reference ? `${reference.repository}:${"referenceType" in reference ? reference.referenceType : "issue"}:${reference.number}`
            : "prefix" in reference ? `${reference.prefix}:${reference.number}` : "";
    const key = `${reference.type}:${value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
