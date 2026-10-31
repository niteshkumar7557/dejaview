// Hackathon rule: every commit message and every PR must name the AI coding agent
// and the AI models the project uses. These pure functions check a piece of text
// (a commit message or a PR body) for both fields. See design.md Appendix B.3.

export const REQUIRED_FIELDS = ["Coding agent", "Models used in project"] as const;
export type RequiredField = (typeof REQUIRED_FIELDS)[number];

export interface FieldCheck {
  ok: boolean;
  missing: RequiredField[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Reads the value written after `Label:` on its own line.
 * Tolerates markdown bullets/bold ("- **Coding agent:** Claude Code"), any letter case,
 * and ignores HTML comments, so an unfilled PR template counts as empty.
 * Returns null when the line is missing or has no real value.
 */
export function readField(text: string, label: string): string | null {
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, "");
  // [ \t] instead of \s: an empty "Label:" line must not swallow the next line as its value.
  const pattern = new RegExp(
    `^[ \\t>*_-]*\\**${escapeRegExp(label)}\\**[ \\t]*:[ \\t]*\\**(.*)$`,
    "im",
  );
  const match = withoutComments.match(pattern);
  if (!match) return null;

  const value = (match[1] ?? "").replace(/[*_`]/g, "").trim();
  const isPlaceholder = value === "" || /^<.*>$/.test(value);
  return isPlaceholder ? null : value;
}

/** Checks that both required fields are present and filled in. */
export function checkText(text: string): FieldCheck {
  const missing = REQUIRED_FIELDS.filter((field) => readField(text, field) === null);
  return { ok: missing.length === 0, missing };
}

export interface CommitResult {
  sha: string;
  subject: string;
  check: FieldCheck;
}

/** Builds the human-readable CI report and says whether everything passed. */
export function buildReport(
  commits: CommitResult[],
  prBody: FieldCheck | null,
): { ok: boolean; lines: string[] } {
  const lines: string[] = [];
  let ok = true;

  for (const commit of commits) {
    const short = commit.sha.slice(0, 7);
    if (commit.check.ok) {
      lines.push(`ok    commit ${short} ${commit.subject}`);
    } else {
      ok = false;
      lines.push(
        `FAIL  commit ${short} ${commit.subject} (missing: ${commit.check.missing.join(", ")})`,
      );
    }
  }

  if (prBody) {
    if (prBody.ok) {
      lines.push("ok    PR description");
    } else {
      ok = false;
      lines.push(`FAIL  PR description (missing: ${prBody.missing.join(", ")})`);
    }
  }

  if (!ok) {
    lines.push(
      "",
      "Every commit message and the PR description must contain both lines, for example:",
      "  Coding agent: Claude Code",
      "  Models used in project: Qwen3.5 9B, Qwen3.5 4B",
    );
  }

  return { ok, lines };
}
