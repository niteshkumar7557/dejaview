// The full pipeline on real threads (PEP 698 and PEP 701 from discuss.python.org), replaying the model
// answers recorded in fixtures/llm/ from real runs on the team laptop. No network, no model: this is what
// CI runs. It must reproduce exactly the output committed in examples/<slug>/output/, which proves each
// example is a real output of this code.
import { readFileSync } from "node:fs";
import type { ExtractionResult, Thread } from "@dejaview/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runExtraction } from "../src/run-extraction.js";
import { memoryLlmStore } from "../src/store.js";

const read = <T>(path: string): T => JSON.parse(readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8")) as T;

describe.each(["pep-698", "pep-701"])("runExtraction on %s, replaying the recorded model answers", (slug) => {
  const previous = { mode: process.env.LLM_MODE, triage: process.env.TRIAGE_MODEL, extract: process.env.EXTRACT_MODEL };
  beforeAll(() => {
    process.env.LLM_MODE = "replay";
    process.env.TRIAGE_MODEL = "qwen3.5:4b";
    process.env.EXTRACT_MODEL = "qwen3.5:9b";
  });
  afterAll(() => {
    for (const [key, name] of [["mode", "LLM_MODE"], ["triage", "TRIAGE_MODEL"], ["extract", "EXTRACT_MODEL"]] as const) {
      if (previous[key] === undefined) delete process.env[name];
      else process.env[name] = previous[key];
    }
  });

  const thread = read<Thread>(`fixtures/threads/${slug}.json`);
  const expected = read<ExtractionResult>(`examples/${slug}/output/decisions.json`);

  it("reproduces the committed example exactly", async () => {
    const result = await runExtraction(thread, { llmStore: memoryLlmStore() });
    expect(result).toEqual(expected);
  });

  it("annotates every post and cites only posts that exist", () => {
    const ids = new Set(thread.posts.map((p) => p.id));
    expect(expected.posts.map((p) => p.postId).sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
    for (const d of expected.decisions) for (const r of d.reasons) for (const e of r.evidence) expect(ids.has(e.postId)).toBe(true);
  });

  it("finds decisions with verified quotes, using both models", () => {
    expect(expected.decisions.length).toBeGreaterThan(0);
    expect(expected.decisions.flatMap((d) => d.reasons.flatMap((r) => r.evidence)).some((e) => e.verified)).toBe(true);
    expect(expected.models).toEqual({ triage: "qwen3.5:4b", extract: "qwen3.5:9b" });
    expect(expected.posts.some((p) => p.triageLabel !== null)).toBe(true);
  });
});
