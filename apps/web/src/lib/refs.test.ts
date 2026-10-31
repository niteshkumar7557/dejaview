import { describe, expect, it } from "vitest";
import { refText } from "./refs";

describe("refText", () => {
  it("prefixes post numbers", () => expect(refText("post", "142")).toBe("#142"));
  it("names PEPs", () => expect(refText("pep", "701")).toBe("PEP 701"));
  it("normalises GitHub issue refs", () => {
    expect(refText("gh", "104131")).toBe("gh-104131");
    expect(refText("gh", "gh-104131")).toBe("gh-104131");
  });
  it("shortens SHAs", () => expect(refText("sha", "a3f09c1e2b7d")).toBe("a3f09c1"));
  it("keeps paths as written", () => expect(refText("path", "Lib/typing.py")).toBe("Lib/typing.py"));
});
