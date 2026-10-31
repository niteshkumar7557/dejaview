import type { PrCheckView } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { commentBody, prCheckResult, selectCheck } from "./pr-checks";

const check = (decisionIds: number[], similarRejectedIds: number[]): PrCheckView => ({
  id: 1, request: { repo: "r", prNumber: 1, title: "t" }, decisionIds, similarRejectedIds, commentMarkdown: "", createdAt: "",
});

describe("prCheckResult", () => {
  it("counts the decisions a PR touches", () => {
    expect(prCheckResult(check([1, 3], []))).toBe("2 past decisions touch this code");
    expect(prCheckResult(check([1], []))).toBe("1 past decision touches this code");
  });
  it("flags a PR that repeats a rejected idea", () => expect(prCheckResult(check([], [11]))).toBe("Looks like a rejected idea"));
  it("says when nothing matched", () => expect(prCheckResult(check([], []))).toBe("No past decisions"));
});

describe("selectCheck", () => {
  const checks = [{ ...check([], []), id: 3 }, { ...check([1], []), id: 1 }];
  it("picks the check named in the URL", () => expect(selectCheck(checks, "1")?.id).toBe(1));
  it("falls back to the first check", () => {
    expect(selectCheck(checks, undefined)?.id).toBe(3);
    expect(selectCheck(checks, "99")?.id).toBe(3);
  });
  it("returns null when there are no checks", () => expect(selectCheck([], "1")).toBeNull());
});

describe("commentBody", () => {
  it("removes the bot's hidden marker", () => {
    expect(commentBody("<!-- dejaview -->\n### Title")).toBe("### Title");
  });
});
