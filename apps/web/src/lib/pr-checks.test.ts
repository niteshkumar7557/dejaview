import type { PrCheckView } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { prCheckResult } from "./pr-checks";

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
