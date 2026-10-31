import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRejectedIdeas, pepUrl, plainRst } from "../../src/eval/pep.js";

// Real PEP sources saved from python/peps, so these tests need no network.
const pep = (n: string) => readFileSync(new URL(`../fixtures/peps/pep-${n}.rst`, import.meta.url), "utf8");

describe("parseRejectedIdeas", () => {
  it("reads one item per sub-heading (PEP 698, 'Rejected Alternatives')", () => {
    const items = parseRejectedIdeas(pep("0698"));
    expect(items.map((i) => i.title)).toEqual([
      "Rely on Integrated Development Environments for safety",
      "Runtime enforcement",
      "Mark a base class to force explicit overrides on subclasses",
      "Include the name of the ancestor class being overridden",
    ]);
    expect(items[1]!.text.length).toBeGreaterThan(50);
  });
  it("reads one item per '#.' list entry when there are no sub-headings (PEP 701)", () => {
    const items = parseRejectedIdeas(pep("0701"));
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items[0]!.text).toMatch(/quote reuse/);
  });
  it("stops at the end of the section and ignores later appendices (PEP 695)", () => {
    const titles = parseRejectedIdeas(pep("0695")).map((i) => i.title);
    expect(titles).toEqual(["Prefix Clause", "Angle Brackets", "Bounds Syntax", "Explicit Variance", "Name Mangling"]);
  });
  it("returns nothing for a document without a rejected-ideas section", () => {
    expect(parseRejectedIdeas("Title\n=====\n\nJust text.\n")).toEqual([]);
  });
});

describe("helpers", () => {
  it("builds the python/peps URL with a 4-digit number", () => {
    expect(pepUrl(698)).toBe("https://raw.githubusercontent.com/python/peps/main/peps/pep-0698.rst");
  });
  it("removes RST markup", () => {
    expect(plainRst("Use ``override`` and :pep:`484` see `docs <https://x>`_")).toBe("Use override and 484 see docs");
  });
});
