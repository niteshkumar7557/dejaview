import { describe, expect, it } from "vitest";
import { fullyVerified } from "./verified";

describe("fullyVerified", () => {
  it("is true only when every quote is verified", () => {
    expect(fullyVerified({ verifiedEvidence: 2, totalEvidence: 2 })).toBe(true);
    expect(fullyVerified({ verifiedEvidence: 1, totalEvidence: 2 })).toBe(false);
  });
  it("is false for a decision with no quotes, since nothing was checked", () => {
    expect(fullyVerified({ verifiedEvidence: 0, totalEvidence: 0 })).toBe(false);
  });
});
