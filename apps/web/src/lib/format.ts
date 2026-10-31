// Display formatting. One rule per kind of figure (app-screens §7.4): fixed decimals,
// separators, a dash for missing values, a printed zero for real zeros.

const DASH = "—"; // taste-skill-ignore: missing-value mark in data, not prose

export function formatPercent(ratio: number | null, digits = 0): string {
  if (ratio === null || Number.isNaN(ratio)) return DASH;
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatDate(iso: string | null): string {
  if (!iso) return DASH;
  return iso.slice(0, 10);
}

export function formatScore(score: number): string {
  // toFixed rounds the binary value (0.615 → "0.61"); nudge by EPSILON so halves round up.
  return (Math.round((score + Number.EPSILON) * 100) / 100).toFixed(2);
}

export function ofTotal(part: number, total: number): string {
  return `${formatCount(part)} of ${formatCount(total)}`;
}

export function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : DASH;
}

/** A pipeline stage as a heading: "extract" → "Extract". Empty or blank → "Unknown stage". */
export function stageLabel(stage: string): string {
  const s = stage.trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : "Unknown stage";
}
