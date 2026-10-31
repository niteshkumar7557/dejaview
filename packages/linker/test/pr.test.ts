import type { CodeAnchor, DecisionSummary, PrCheckRequest } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { matchPr, renderPrComment } from "../src/index.js";

function anchor(overrides: Partial<CodeAnchor> = {}): CodeAnchor {
  return {
    repo: "python/cpython",
    symbol: null,
    originalPath: "Lib/typing.py",
    originalCommit: null,
    currentPath: "Lib/typing.py",
    relocatedBy: null,
    linkMethod: "path_mention",
    evidencePostId: 1,
    ...overrides,
  };
}

function summary(overrides: Partial<DecisionSummary> = {}): DecisionSummary {
  return {
    id: 1,
    topic: { slug: "pep-701", title: "PEP 701", pepNumber: 701 },
    title: "Keep the tokenizer architecture stable",
    status: "accepted",
    confidence: "high",
    reasons: ["Changing the tokenizer would add unnecessary complexity."],
    anchors: [anchor()],
    verifiedEvidence: 1,
    totalEvidence: 1,
    ...overrides,
  };
}

function request(overrides: Partial<PrCheckRequest> = {}): PrCheckRequest {
  return {
    repo: "python/cpython",
    prNumber: 50,
    title: "Adjust tokenizer implementation",
    body: "A small change to the parser.",
    files: [{ path: "Lib/typing.py", previousPath: null }],
    symbols: [],
    ...overrides,
  };
}

describe("matchPr", () => {
  it("matches accepted decisions by current path", () => {
    const candidate = summary({ anchors: [anchor({ currentPath: "Lib/current.py", originalPath: "Lib/original.py" })] });
    expect(matchPr(request({ files: [{ path: "Lib/current.py", previousPath: null }] }), [candidate])).toEqual([candidate]);
  });

  it("matches original paths and previous filenames supplied for renames", () => {
    const candidate = summary({ anchors: [anchor({ currentPath: "Lib/new.py", originalPath: "Lib/old.py" })] });
    expect(matchPr(request({ files: [{ path: "Other/new.py", previousPath: "Lib/old.py" }] }), [candidate])).toEqual([candidate]);
    expect(matchPr(request({ files: [{ path: "Lib/new.py", previousPath: null }] }), [candidate])).toEqual([candidate]);
  });

  it("matches symbols exactly", () => {
    const candidate = summary({ anchors: [anchor({ symbol: "PyErr_SetString", currentPath: null })] });
    expect(matchPr(request({ files: [], symbols: ["PyErr_SetString"] }), [candidate])).toEqual([candidate]);
    expect(matchPr(request({ files: [], symbols: ["pyerr_setstring"] }), [candidate])).toEqual([]);
  });

  it("returns accepted file matches as informational context rather than contradictions", () => {
    const candidate = summary();
    expect(matchPr(request({ files: [{ path: "Lib/typing.py", previousPath: null }], symbols: [] }), [candidate])).toEqual([candidate]);
  });

  it("matches rejected proposals by deterministic lexical overlap, not code touch alone", () => {
    const rejected = summary({
      id: 2,
      status: "rejected",
      title: "Rewrite tokenizer in Rust",
      reasons: ["The Rust tokenizer would slow down parser startup."],
      anchors: [anchor()],
    });
    expect(matchPr(request({ title: "Rewrite tokenizer in Rust", body: "A Rust rewrite would slow down parser startup." }), [rejected])).toEqual([rejected]);
    expect(matchPr(request({ title: "Update tokenizer tests", body: "No language rewrite is proposed." }), [rejected])).toEqual([]);
  });

  it("returns multiple relevant decisions once in candidate order", () => {
    const first = summary({ id: 8, anchors: [anchor({ symbol: "PyObject", currentPath: null })] });
    const second = summary({ id: 9, status: "rejected", title: "Rewrite tokenizer in Rust", reasons: ["Rust changes tokenizer performance."] });
    const duplicate = summary({ id: 8, title: "Duplicate candidate" });
    expect(matchPr(request({ symbols: ["PyObject"], title: "Rewrite tokenizer in Rust", body: "Tokenizer rewritten in Rust." }), [first, second, duplicate])).toEqual([first, second]);
  });

  it("ignores unrelated decisions, empty candidates, and unsupported statuses", () => {
    const unrelated = summary({ anchors: [anchor({ currentPath: "Objects/other.c", originalPath: "Objects/other.c", symbol: "PyOther" })] });
    const open = summary({ id: 2, status: "open", title: "Adjust tokenizer", anchors: [anchor()] });
    expect(matchPr(request({ files: [{ path: "Objects/new.c", previousPath: null }], symbols: ["PyDifferent"] }), [unrelated, open])).toEqual([]);
    expect(matchPr(request(), [])).toEqual([]);
  });

  it("handles omitted runtime fields and does not mutate inputs", () => {
    const candidate = Object.freeze(summary({ reasons: Object.freeze([]) as unknown as string[], anchors: Object.freeze([anchor({ currentPath: null })]) as unknown as CodeAnchor[] }));
    const req = Object.freeze(request({ files: Object.freeze([{ path: "Lib/typing.py", previousPath: null }]) as unknown as PrCheckRequest["files"], symbols: Object.freeze([]) as unknown as string[] }));
    expect(matchPr(req, [candidate])).toEqual([candidate]);
    expect(candidate.anchors[0]?.currentPath).toBeNull();
    expect(req.files[0]?.path).toBe("Lib/typing.py");
  });

  it("handles missing runtime anchor and reason arrays", () => {
    const incomplete = { ...summary(), anchors: undefined, reasons: undefined } as unknown as DecisionSummary;
    expect(matchPr(request(), [incomplete])).toEqual([]);
  });
});

describe("renderPrComment", () => {
  const dashboard = "https://dejaview.example";

  it("renders an empty comment snapshot", () => {
    expect(renderPrComment([], [], dashboard)).toMatchSnapshot();
  });

  it("renders one accepted decision snapshot", () => {
    expect(renderPrComment([summary()], [], dashboard)).toMatchSnapshot();
  });

  it("renders multiple accepted decisions snapshot", () => {
    expect(renderPrComment([summary(), summary({ id: 2, topic: { slug: "pep-695", title: "PEP 695", pepNumber: 695 }, title: "Use explicit type parameters" })], [], dashboard)).toMatchSnapshot();
  });

  it("renders one rejected decision snapshot", () => {
    expect(renderPrComment([], [summary({ id: 3, status: "rejected", title: "Rewrite the tokenizer in Rust", reasons: ["The rewrite would make startup slower."] })], dashboard)).toMatchSnapshot();
  });

  it("renders multiple rejected decisions snapshot", () => {
    const first = summary({ id: 3, status: "rejected", title: "Rewrite the tokenizer in Rust", reasons: ["The rewrite would make startup slower."] });
    const second = summary({ id: 4, topic: { slug: "pep-695", title: "PEP 695", pepNumber: 695 }, status: "rejected", title: "Replace runtime types with generated code", reasons: ["Generated runtime code would be difficult to maintain."] });
    expect(renderPrComment([], [first, second], dashboard)).toMatchSnapshot();
  });

  it("renders mixed decisions and safely escapes special Markdown content", () => {
    const accepted = summary({ title: "Don't change [the] parser | <script>", reasons: ["Keep `user` input safe & predictable."] });
    const rejected = summary({ id: 3, status: "rejected", title: "Replace parser *now*", reasons: ["Avoid <unsafe> changes | today."] });
    expect(renderPrComment([accepted], [rejected], dashboard)).toMatchSnapshot();
  });

  it("renders matched rejected decisions when full-text search is empty and deduplicates IDs", () => {
    const accepted = summary({ id: 10, title: "Use typing.override" });
    const rejected = summary({
      id: 11,
      status: "rejected",
      title: "Rework typing.override as a decorator factory",
      reasons: ["The factory would add unnecessary complexity."],
    });
    const comment = renderPrComment([accepted, rejected, rejected], [], dashboard);

    expect(comment).toContain("**📜 DejaView check — 2 past decisions touch this code or proposal**");
    expect(comment).toContain("### Previously rejected similar proposals");
    expect(comment).toContain("Rework typing\\.override as a decorator factory");
    expect(comment).not.toContain("No similar previously rejected proposals were found.");
    expect(comment.match(/Rework typing\\\.override as a decorator factory/g)).toHaveLength(1);
    expect(comment).toContain("ACCEPTED: Use typing\\.override");
    expect(comment).toMatchSnapshot();
  });

  it("handles a missing dashboard URL, emits the marker once, and stays deterministic", () => {
    const first = renderPrComment([summary()], [], "");
    const second = renderPrComment([summary()], [], "");
    expect(first).toBe(second);
    expect(first.match(/<!-- dejaview -->/g)).toHaveLength(1);
    expect(first).not.toContain("](<");
  });
});
