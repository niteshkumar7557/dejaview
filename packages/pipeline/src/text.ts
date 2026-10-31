// Small text helpers shared by the stages: HTML to text, normalising for comparison, and words.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Discourse "cooked" HTML → plain text. Quoted replies (<aside class="quote">) and link previews
 * (<aside class="onebox">) are removed first: a reply repeats what it answers, and we want each
 * idea attributed to the post that actually said it.
 */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
      .replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, " ")
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|pre|tr)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "- ")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Markdown (GitHub) → text without quoted lines ("> …"), for the same reason as above. */
export function stripMarkdownQuotes(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lower case, straight quotes, no punctuation, single spaces. Used to compare quotes with posts. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .replace(/'/g, "")
    .trim();
}

export function words(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are", "be", "it", "this", "that", "with",
  "as", "by", "at", "we", "i", "you", "not", "no", "but", "if", "so", "can", "would", "should", "could", "will",
  "from", "have", "has", "was", "were", "do", "does", "its", "they", "there", "which", "what", "when", "than",
]);

/** Words that carry meaning (no stop words, at least 3 letters), for overlap scoring. */
export function contentWords(text: string): Set<string> {
  return new Set(words(text).filter((w) => w.length >= 3 && !STOP.has(w)));
}

/** Rough token count for sizing prompts (about 4 characters per token). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars).trimEnd()} …`;
}
