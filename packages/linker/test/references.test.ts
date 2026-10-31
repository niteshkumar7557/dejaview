import { describe, expect, it } from "vitest";
import type { ThreadPost } from "@dejaview/shared";
import { findReferences } from "../src/index.js";

function post(body: string): ThreadPost {
  return { id: 1, externalId: "1", author: "tester", createdAt: null, url: null, body, format: "markdown" };
}

function ofType(body: string, type: string) {
  return findReferences(post(body)).filter((reference) => reference.type === type);
}

describe("findReferences", () => {
  it("recognizes gh and bpo references case-insensitively", () => {
    expect(ofType("gh-12345 GH-12 bpo-3 BPO-456", "issue").map((r) => [r.type, "prefix" in r && r.prefix, "number" in r && r.number]))
      .toEqual([["issue", "gh", 12345], ["issue", "gh", 12], ["issue", "bpo", 3], ["issue", "bpo", 456]]);
  });

  it("recognizes repository references with optional whitespace", () => {
    expect(ofType("python/cpython#12345 and python/cpython #9", "repository").map((r) => "number" in r && r.number)).toEqual([12345, 9]);
  });

  it("recognizes pull and issue URLs and rejects invalid URLs", () => {
    const refs = ofType("https://github.com/python/cpython/pull/12345; https://github.com/python/cpython/issues/3 https://github.com/python/cpython/commit/abc1234", "github_url");
    expect(refs.map((r) => "referenceType" in r && [r.repository, r.referenceType, r.number])).toEqual([
      ["python/cpython", "pull", 12345], ["python/cpython", "issues", 3],
    ]);
  });

  it("recognizes full and abbreviated hashes, excluding numeric and short hex strings", () => {
    expect(ofType("deadbeef1234567890abcdef1234567890abcdef and abcdef1, 12345678, 0xdeadbeef, cafe", "commit")
      .map((r) => "sha" in r && r.sha)).toEqual(["deadbeef1234567890abcdef1234567890abcdef", "abcdef1"]);
  });

  it("recognizes CPython source paths with supported extensions", () => {
    const paths = ofType("See Lib/typing.py, Objects/typevarobject.c, Modules/_abc.c, Include/Python.h, Python/errors.c, Lib/test/test_typing.py and Parser/tokenizer.h", "path");
    expect(paths.map((r) => "path" in r && r.path)).toEqual([
      "Lib/typing.py", "Objects/typevarobject.c", "Modules/_abc.c", "Include/Python.h", "Python/errors.c", "Lib/test/test_typing.py", "Parser/tokenizer.h",
    ]);
    expect(ofType("not/a/path.py and https://example.org/Lib/typing.py", "path")).toHaveLength(0);
  });

  it("recognizes backticked identifiers, qualified symbols and C API names", () => {
    const symbols = ofType("Use `typing.override`, `PyErr_SetString`, `PyObject`, `TypeVar`, collections.abc.Callable.", "symbol");
    expect(symbols.map((r) => "symbol" in r && r.symbol)).toEqual(["typing.override", "PyErr_SetString", "PyObject", "TypeVar", "collections.abc.Callable"]);
  });

  it("handles mixed references, prose, duplicates, and overlapping patterns once", () => {
    const refs = findReferences(post("Discuss gh-1 and python/cpython#2. See https://github.com/python/cpython/pull/3 and `Lib/typing.py`, `typing.override`, typing.override."));
    expect(refs.map((r) => r.type)).toEqual(["issue", "repository", "github_url", "path", "symbol"]);
    expect(refs.filter((r) => r.type === "symbol" && "symbol" in r && r.symbol === "typing.override")).toHaveLength(1);
    expect(refs.every((r) => r.start >= 0 && r.end > r.start && r.text.length === r.end - r.start)).toBe(true);
  });

  it("returns no references for empty or malformed posts", () => {
    expect(findReferences(post(""))).toEqual([]);
    expect(findReferences({ ...post(""), body: undefined } as unknown as ThreadPost)).toEqual([]);
    expect(findReferences(null as unknown as ThreadPost)).toEqual([]);
  });
});
