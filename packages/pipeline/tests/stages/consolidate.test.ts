import { describe, expect, it } from "vitest";
import { consolidate, normalizeGroups } from "../../src/consolidate.js";
import type { Ask } from "../../src/llm/ask.js";

const candidates = [
  { title: "Runtime checks", status: "rejected", reasons: ["slow"] },
  { title: "Check overrides at runtime", status: "rejected", reasons: ["too slow"] },
  { title: "Name it @overrides", status: "rejected", reasons: [] },
];

describe("normalizeGroups", () => {
  it("puts every candidate in exactly one group, whatever the model returns", () => {
    const groups = normalizeGroups([{ ids: [0, 1, 7], title: "Runtime enforcement" }, { ids: [1], title: "dup" }], candidates);
    expect(groups).toEqual([
      { members: [0, 1], title: "Runtime enforcement" },
      { members: [2], title: "Name it @overrides" },
    ]);
  });
});

describe("consolidate", () => {
  it("does not call the model for a single candidate", async () => {
    const ask = (async () => { throw new Error("should not be called"); }) as Ask;
    await expect(consolidate(ask, "t", candidates.slice(0, 1))).resolves.toEqual([{ members: [0], title: "Runtime checks" }]);
  });
  it("uses the 9B model's grouping", async () => {
    const ask = (async (options: { stage: string }) => {
      expect(options.stage).toBe("consolidate");
      return { groups: [{ ids: [0, 1], title: "Runtime enforcement" }, { ids: [2], title: "Name it @overrides" }] };
    }) as unknown as Ask;
    expect((await consolidate(ask, "t", candidates)).map((g) => g.members)).toEqual([[0, 1], [2]]);
  });
});
