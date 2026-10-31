import type { DecisionSummary, TopicSummary } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { overviewFinding, overviewKpis } from "./overview";

const topic = (slug: string, pep: number, decisionCount: number, rejectedCount: number, lastRecall: number | null): TopicSummary => ({
  slug, title: slug, pepNumber: pep, decisionCount, rejectedCount, sourceCount: 1, lastRecall,
});
const decision = (id: number, slug: string, pep: number, verified: number, total: number): DecisionSummary => ({
  id, topic: { slug, title: slug, pepNumber: pep }, title: `d${id}`, status: "rejected", confidence: "high",
  reasons: [], anchors: [], verifiedEvidence: verified, totalEvidence: total,
});

describe("overviewFinding", () => {
  it("names the discussion with the most decisions resting on unverified quotes", () => {
    const ds = [decision(1, "pep-1", 1, 2, 2), decision(2, "pep-2", 2, 0, 2), decision(3, "pep-2", 2, 1, 2)];
    expect(overviewFinding(ds)).toBe("PEP 2: 2 decisions rest on quotes we couldn't match to their post.");
  });
  it("uses the singular for one decision", () => {
    expect(overviewFinding([decision(1, "pep-7", 7, 0, 1)])).toBe(
      "PEP 7: 1 decision rests on quotes we couldn't match to its post.",
    );
  });
  it("says so when every decision is verified", () => {
    expect(overviewFinding([decision(1, "pep-1", 1, 2, 2)])).toBe("Every recovered decision is backed by verified quotes.");
  });
});

describe("overviewKpis", () => {
  it("sums decisions and rejections, and computes the verified share and mean recall", () => {
    const kpis = overviewKpis(
      [topic("a", 1, 4, 2, 0.5), topic("b", 2, 6, 3, null), topic("c", 3, 2, 1, 1)],
      [decision(1, "a", 1, 3, 4), decision(2, "b", 2, 1, 1)],
    );
    expect(kpis).toEqual([
      { label: "Decisions recovered", value: "12", sub: "from 3 discussions" },
      { label: "Rejected ideas", value: "6", sub: "with their reasons" },
      { label: "Quotes verified", value: "80%", sub: "4 of 5 quotes found in their post" },
      { label: "Recall against the PEP", value: "75%", sub: "mean of 2 evaluated PEPs" },
    ]);
  });
  it("prints a dash for recall when nothing is evaluated", () => {
    expect(overviewKpis([topic("a", 1, 0, 0, null)], [])[3]).toEqual({
      label: "Recall against the PEP", value: "—", sub: "no PEP evaluated yet",
    });
  });
});
