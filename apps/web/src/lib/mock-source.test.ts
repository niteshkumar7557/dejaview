import { describe, expect, it } from "vitest";
import { createMockSource } from "./mock-source";

const source = createMockSource();

describe("mock source search", () => {
  it("returns nothing for a query that matches nothing", async () => {
    await expect(source.searchDecisions({ q: "zzz" })).resolves.toEqual([]);
  });
  it("filters by status", async () => {
    const rejected = await source.searchDecisions({ status: "rejected" });
    expect(rejected.length).toBeGreaterThan(0);
    expect(rejected.every((d) => d.status === "rejected")).toBe(true);
  });
  it("matches title and reasons case-insensitively", async () => {
    const hits = await source.searchDecisions({ q: "BACKSLASH" });
    expect(hits.length).toBeGreaterThan(0);
    expect(
      hits.every((d) => `${d.title} ${d.reasons.join(" ")}`.toLowerCase().includes("backslash")),
    ).toBe(true);
  });
  it("filters to fully verified decisions", async () => {
    const verified = await source.searchDecisions({ verified: true });
    expect(verified.every((d) => d.verifiedEvidence === d.totalEvidence)).toBe(true);
  });
  it("filters by topic", async () => {
    const own = await source.searchDecisions({ topic: "pep-698" });
    expect(own.every((d) => d.topic.slug === "pep-698")).toBe(true);
  });
});

describe("mock source lookups", () => {
  it("returns null for an unknown topic", async () => {
    await expect(source.getTopic("pep-9999")).resolves.toBeNull();
  });
  it("returns three model calls for a decision, using both models", async () => {
    const calls = await source.getLlmCalls(1);
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.model))).toEqual(new Set(["qwen3.5:4b", "qwen3.5:9b"]));
  });
  it("starts an ingest job that can be read back", async () => {
    const { jobId } = await source.startIngest({ url: "https://discuss.python.org/t/x/1", topicSlug: "pep-698" });
    const job = await source.getJob(jobId);
    expect(job?.status).toBe("running");
  });
});
