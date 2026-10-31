import { describe, expect, it } from "vitest";
import { allEvalRuns } from "../mocks/views";
import { agreementText, decisionIdFromKey, matchedCount, resolveMatch } from "./eval";

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

describe("resolveMatch", () => {
  const decisions = [
    { id: 7, title: "Keep the STRING token", topic: { slug: "pep-701" } },
    { id: 3, title: "Runtime enforcement", topic: { slug: "pep-698" } },
  ];
  it("links a key to a decision in the run's own discussion", () => {
    expect(resolveMatch("d7", "pep-701", decisions)).toEqual({ id: 7, title: "Keep the STRING token" });
  });
  it("never links to a decision from another discussion", () => {
    expect(resolveMatch("d3", "pep-701", decisions)).toBeNull();
  });
  it("returns null for no key", () => expect(resolveMatch(null, "pep-701", decisions)).toBeNull());
});
