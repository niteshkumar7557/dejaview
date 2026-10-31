import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport, checkText, readField } from "./conventions.js";

const goodCommit = `Add tests for URL parser

Coding agent: Claude Code
Models used in project: Qwen3.5 9B, Qwen3.5 4B
`;

describe("readField", () => {
  it("reads a plain field", () => {
    expect(readField(goodCommit, "Coding agent")).toBe("Claude Code");
    expect(readField(goodCommit, "Models used in project")).toBe("Qwen3.5 9B, Qwen3.5 4B");
  });

  it("ignores letter case", () => {
    expect(readField("coding AGENT: Cursor", "Coding agent")).toBe("Cursor");
  });

  it("accepts markdown bullets and bold", () => {
    expect(readField("- **Coding agent:** MiniMax M3", "Coding agent")).toBe("MiniMax M3");
    expect(readField("* **Coding agent**: Claude Code", "Coding agent")).toBe("Claude Code");
  });

  it("returns null when the field is missing", () => {
    expect(readField("Fix typo", "Coding agent")).toBeNull();
  });

  it("treats empty values, HTML comments and <placeholders> as missing", () => {
    expect(readField("Coding agent:", "Coding agent")).toBeNull();
    expect(readField("Coding agent: <!-- e.g. Claude Code -->", "Coding agent")).toBeNull();
    expect(readField("Coding agent: <your agent>", "Coding agent")).toBeNull();
  });

  it("does not take the next line as the value of an empty field", () => {
    const text = "Coding agent:\nModels used in project: Qwen3.5 9B";
    expect(readField(text, "Coding agent")).toBeNull();
    expect(readField(text, "Models used in project")).toBe("Qwen3.5 9B");
  });

  it("accepts 'none' as an honest answer", () => {
    expect(readField("Coding agent: none", "Coding agent")).toBe("none");
  });
});

describe("checkText", () => {
  it("passes when both fields are filled", () => {
    expect(checkText(goodCommit)).toEqual({ ok: true, missing: [] });
  });

  it("lists every missing field", () => {
    expect(checkText("Add parser")).toEqual({
      ok: false,
      missing: ["Coding agent", "Models used in project"],
    });
    expect(checkText("Add parser\n\nCoding agent: Claude Code")).toEqual({
      ok: false,
      missing: ["Models used in project"],
    });
  });

  it("fails the unfilled PR template and passes once the agent is filled in", () => {
    const template = readFileSync(".github/pull_request_template.md", "utf8");
    expect(checkText(template)).toEqual({ ok: false, missing: ["Coding agent"] });

    const filled = template.replace(
      /^Coding agent:.*$/m,
      "Coding agent: Claude Code",
    );
    expect(checkText(filled)).toEqual({ ok: true, missing: [] });
  });
});

describe("buildReport", () => {
  const ok = { ok: true, missing: [] };
  const bad = { ok: false, missing: ["Coding agent" as const] };

  it("passes when every commit and the PR body pass", () => {
    const report = buildReport([{ sha: "abcdef123", subject: "Add CI", check: ok }], ok);
    expect(report.ok).toBe(true);
    expect(report.lines).toEqual(["ok    commit abcdef1 Add CI", "ok    PR description"]);
  });

  it("fails and explains when a commit is missing a field", () => {
    const report = buildReport([{ sha: "abcdef123", subject: "Add CI", check: bad }], null);
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toBe("FAIL  commit abcdef1 Add CI (missing: Coding agent)");
    expect(report.lines).toContain("  Coding agent: Claude Code");
  });

  it("fails when the PR body is missing a field", () => {
    const report = buildReport([], bad);
    expect(report.ok).toBe(false);
    expect(report.lines[0]).toBe("FAIL  PR description (missing: Coding agent)");
  });
});
