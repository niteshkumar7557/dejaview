import { describe, expect, it } from "vitest";
import { allEvalRuns } from "../mocks/views";
import { agreementText, decisionIdFromKey, matchedCount } from "./eval";

describe("decisionIdFromKey", () => {
  it("reads the id from a decision key", () => expect(decisionIdFromKey("d12")).toBe(12));
  it("returns null for a missing or malformed key", () => {
    expect(decisionIdFromKey(null)).toBeNull();
    expect(decisionIdFromKey("x")).toBeNull();
  });
});

describe("agreementText", () => {
  it("words each verdict", () => {
    expect(agreementText("yes")).toBe("Yes");
    expect(agreementText("partial")).toBe("Partly");
    expect(agreementText("no")).toBe("No");
    expect(agreementText(null)).toBe("—");
  });
});

describe("matchedCount", () => {
  it("agrees with the run's recall", () => {
    for (const run of allEvalRuns()) {
      expect(matchedCount(run) / run.groundTruth.length).toBeCloseTo(run.recall);
    }
  });
});
