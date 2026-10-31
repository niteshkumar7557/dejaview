import { describe, expect, it } from "vitest";
import type { DataSource } from "./data-source";
import { lazySource } from "./lazy-source";
import { createMockSource } from "./mock-source";

describe("lazySource", () => {
  it("loads the implementation once, on first use, and forwards calls and arguments", async () => {
    let loads = 0;
    const source = lazySource(async () => {
      loads += 1;
      return createMockSource();
    });
    expect(loads).toBe(0);
    const topic = await source.getTopic("pep-698");
    expect(topic?.slug).toBe("pep-698");
    await source.listTopics();
    expect(loads).toBe(1);
  });

  it("passes failures through", async () => {
    const failing = { getJob: async () => { throw new Error("boom"); } } as unknown as DataSource;
    await expect(lazySource(async () => failing).getJob(1)).rejects.toThrow("boom");
  });

  it("exposes every DataSource method", () => {
    const source = lazySource(async () => createMockSource());
    for (const name of Object.keys(createMockSource())) {
      expect(typeof source[name as keyof DataSource]).toBe("function");
    }
  });
});
