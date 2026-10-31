import type { TimelinePost } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { stripCounts, stripGeometry } from "./strip-geometry";

const post = (id: number, over: Partial<TimelinePost> = {}): TimelinePost => ({
  id, author: "a", createdAt: null, url: null, bodyClean: "", signalScore: 0.5,
  triageLabel: "support", skipped: false, decisionIds: [], ...over,
});

const posts = [
  post(1, { skipped: true, signalScore: null, triageLabel: null }),
  post(2, { signalScore: 1 }),
  post(3, { signalScore: null }),
  post(4, { decisionIds: [3], signalScore: 0.2 }),
];

describe("stripGeometry", () => {
  const ticks = stripGeometry(posts, 400, 50);
  it("spaces ticks evenly across the width", () => expect(ticks.map((t) => t.x)).toEqual([50, 150, 250, 350]));
  it("draws skipped posts as short stubs", () => expect(ticks[0]).toMatchObject({ h: 4, kind: "skipped" }));
  it("scales read posts by signal score", () => expect(ticks[1]).toMatchObject({ h: 50, kind: "read" }));
  it("gives an unscored read post the minimum height", () => expect(ticks[2]!.h).toBe(6));
  it("marks posts cited as evidence", () => expect(ticks[3]).toMatchObject({ kind: "evidence", h: 10, decisionIds: [3] }));
  it("is empty for an empty thread", () => expect(stripGeometry([], 400, 50)).toEqual([]));
  it("keeps real pipeline scores (not 0..1) inside the strip, scaled by the top score", () => {
    const real = stripGeometry([post(1, { signalScore: 11 }), post(2, { signalScore: 5.5 })], 200, 50);
    expect(real.map((t) => t.h)).toEqual([50, 25]);
    expect(Math.max(...real.map((t) => t.h))).toBeLessThanOrEqual(50);
  });
});

describe("stripCounts", () => {
  it("counts total, read and evidence posts", () => expect(stripCounts(posts)).toEqual({ total: 4, read: 3, evidence: 1 }));
});
