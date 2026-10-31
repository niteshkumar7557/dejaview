import type { ExtractedDecision, ExtractionResult } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { evaluatePep, evaluateWith, overlap, shortlist } from "../../src/eval/evaluate.js";
import type { Ask, AskOptions } from "../../src/llm/ask.js";
import { memoryLlmStore } from "../../src/store.js";

const decision = (key: string, title: string, status: ExtractedDecision["status"], reason: string): ExtractedDecision => ({
  key, title, kind: "alternative", status, summary: title, confidence: "high", decidedAt: null, model: "qwen3.5:9b",
  reasons: [{ text: reason, evidence: [] }],
});

const result: ExtractionResult = {
  topicSlug: "pep-698", models: { triage: "qwen3.5:4b", extract: "qwen3.5:9b" }, posts: [],
  decisions: [
    decision("d1", "Add typing.override", "accepted", "type checkers can catch mistakes"),
    decision("d2", "Enforce overrides at runtime", "rejected", "runtime enforcement adds overhead to every class"),
    decision("d3", "Use a different decorator name", "rejected", "bikeshedding"),
  ],
};

const groundTruth = [
  { title: "Runtime enforcement", text: "We considered enforcing overrides at runtime but it adds overhead." },
  { title: "Rely on IDEs", text: "IDEs could warn instead of type checkers." },
];

describe("shortlist", () => {
  it("ranks the decision sharing the most meaningful words first", () => {
    expect(shortlist(groundTruth[0]!, result.decisions)[0]!.key).toBe("d2");
    expect(overlap("runtime enforcement overhead", "nothing in common")).toBe(0);
  });
});

describe("evaluateWith", () => {
  it("computes recall, reason agreement and extra ideas from the 9B judge's verdicts", async () => {
    const calls: AskOptions<unknown>[] = [];
    const ask = (async (options: AskOptions<unknown>) => {
      calls.push(options);
      return options.prompt.includes("Runtime enforcement") ? { best: 0, reasons_agree: "partial" } : { best: -1, reasons_agree: "no" };
    }) as Ask;
    const evaluation = await evaluateWith(698, groundTruth, result, ask);
    expect(calls.every((c) => c.stage === "eval" && c.model === "qwen3.5:9b")).toBe(true);
    expect(evaluation.matches.map((m) => m.decisionKey)).toEqual(["d2", null]);
    expect(evaluation.recall).toBe(0.5);
    expect(evaluation.reasonAgreement).toBe(0.5);
    expect(evaluation.extraIdeas).toBe(1); // d3 is rejected and matched nothing
  });
  it("ignores an out-of-range answer from the judge", async () => {
    const ask = (async () => ({ best: 9, reasons_agree: "yes" })) as Ask;
    const evaluation = await evaluateWith(698, groundTruth.slice(0, 1), result, ask);
    expect(evaluation.matches[0]!.decisionKey).toBeNull();
    expect(evaluation.recall).toBe(0);
  });
});

describe("evaluatePep", () => {
  it("fetches the PEP only here, and fails clearly when it cannot", async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => { urls.push(String(url)); return new Response("nope", { status: 404 }); }) as unknown as typeof fetch;
    await expect(evaluatePep(698, result, { llmStore: memoryLlmStore(), fetchImpl })).rejects.toThrow("Could not fetch PEP 698: HTTP 404");
    expect(urls).toEqual(["https://raw.githubusercontent.com/python/peps/main/peps/pep-0698.rst"]);
  });
});
