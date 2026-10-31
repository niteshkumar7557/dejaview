// CLI used by .github/workflows/conventions.yml.
// Checks every non-merge commit in BASE_SHA..HEAD_SHA, and the PR description in PR_BODY
// (when PR_BODY is set), for the "Coding agent:" and "Models used in project:" lines.
//
// Local use:  BASE_SHA=origin/main HEAD_SHA=HEAD npm run check:conventions

import { execFileSync } from "node:child_process";
import { buildReport, checkText, type CommitResult } from "./conventions.js";

function git(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

const base = process.env.BASE_SHA;
const head = process.env.HEAD_SHA ?? "HEAD";

if (!base) {
  console.error("BASE_SHA is required (the commit the branch starts from, e.g. origin/main).");
  process.exit(2);
}

const shas = git(["rev-list", "--no-merges", "--reverse", `${base}..${head}`])
  .split("\n")
  .filter(Boolean);

const commits: CommitResult[] = shas.map((sha) => ({
  sha,
  subject: git(["log", "-1", "--format=%s", sha]),
  check: checkText(git(["log", "-1", "--format=%B", sha])),
}));

const prBody = process.env.PR_BODY === undefined ? null : checkText(process.env.PR_BODY);

const report = buildReport(commits, prBody);
console.log(report.lines.join("\n"));
process.exit(report.ok ? 0 : 1);
