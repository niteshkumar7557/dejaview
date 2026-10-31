import type { TimelinePost } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { groupTimeline, labelCounts, statusCounts } from "./timeline";

const post = (id: number, skipped = false): TimelinePost => ({
  id, author: "a", createdAt: null, url: null, bodyClean: "", signalScore: skipped ? null : 0.5,
  triageLabel: skipped ? null : "support", skipped, decisionIds: [],
});

describe("groupTimeline", () => {
  it("folds each run of filtered posts into one item", () => {
    const items = groupTimeline([post(1), post(2, true), post(3, true), post(4), post(5, true)]);
    expect(items.map((i) => (i.type === "post" ? `p${i.post.id}` : `f${i.posts.map((p) => p.id).join(",")}`))).toEqual([
      "p1", "f2,3", "p4", "f5",
    ]);
  });
  it("keeps a thread with nothing filtered as posts", () => {
    expect(groupTimeline([post(1), post(2)]).every((i) => i.type === "post")).toBe(true);
  });
  it("returns nothing for an empty thread", () => expect(groupTimeline([])).toEqual([]));
});

describe("statusCounts", () => {
  it("counts each status and the total", () => {
    const counts = statusCounts([{ status: "rejected" }, { status: "rejected" }, { status: "accepted" }]);
    expect(counts).toEqual({ all: 3, accepted: 1, rejected: 2, withdrawn: 0, open: 0 });
  });
});

describe("labelCounts", () => {
  it("counts posts per triage label in label order, then filtered posts", () => {
    const labelled = (id: number, triageLabel: TimelinePost["triageLabel"]) => ({ ...post(id), triageLabel });
    const rows = labelCounts([labelled(1, "proposal"), labelled(2, "noise"), labelled(3, "noise"), post(4, true)]);
    expect(rows).toEqual([
      { label: "Proposal", count: 1 }, { label: "Alternative", count: 0 }, { label: "Objection", count: 0 },
      { label: "Support", count: 0 }, { label: "Decision", count: 0 }, { label: "Question", count: 0 },
      { label: "Noise", count: 2 }, { label: "Filtered before the model", count: 1 },
    ]);
  });
});
