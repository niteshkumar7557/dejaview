// The whole funnel with a fake model: checks the stages are wired together correctly, that both
// models are used for their jobs, and that quotes are verified against the real posts.
import type { Thread } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import type { Ask, AskOptions } from "../../src/llm/ask.js";
import { confidenceOf, extractWith, reachesExtraction } from "../../src/run-extraction.js";
import { triagePrompt } from "../../src/triage.js";

const thread: Thread = {
  topic: { slug: "pep-9", title: "PEP 9: a test decorator", pepNumber: 9 },
  source: { kind: "upload", url: null, title: "t", externalId: null },
  posts: [
    { id: 1, externalId: "1", author: "author", createdAt: "2024-01-01T00:00:00Z", url: null, format: "text", body: "I propose a new decorator that marks overriding methods for type checkers." },
    { id: 2, externalId: "2", author: "bob", createdAt: "2024-01-02T00:00:00Z", url: null, format: "text", body: "Why not check overrides at runtime instead? That seems safer to me as an alternative." },
    { id: 3, externalId: "3", author: "author", createdAt: "2024-01-03T00:00:00Z", url: null, format: "text", body: "A runtime check would slow every call, so we rejected that alternative." },
    { id: 4, externalId: "4", author: "carol", createdAt: "2024-01-04T00:00:00Z", url: null, format: "text", body: "+1" },
    { id: 5, externalId: "5", author: "brettcannon", createdAt: "2024-01-05T00:00:00Z", url: null, format: "text", body: "The Steering Council has decided to accept this PEP." },
  ],
};

function fakeAsk(calls: AskOptions<unknown>[]): Ask {
  return (async (options: AskOptions<unknown>) => {
    calls.push(options);
    if (options.stage === "triage") {
      const ids = [...options.prompt.matchAll(/\[post (\d+)\]/g)].map((m) => Number(m[1]));
      return { labels: ids.map((id) => ({ post_id: id, label: id === 5 ? "decision" : id === 2 ? "alternative" : "proposal" })) };
    }
    if (options.stage === "extract") {
      return {
        ideas: [
          { title: "Add an override decorator", kind: "proposal", status: "accepted", summary: "Accepted by the SC.",
            reasons: [{ text: "the SC accepted it", evidence: [{ post_id: 5, quote: "decided to accept this PEP" }] }] },
          { title: "Runtime override checks", kind: "alternative", status: "rejected", summary: "Too slow.",
            reasons: [{ text: "it would slow every call", evidence: [
              { post_id: 2, quote: "A runtime check would slow every call" },
              { post_id: 3, quote: "everybody loved runtime checks" },
            ] }] },
        ],
      };
    }
    return { groups: [{ ids: [0], title: "Add an override decorator" }, { ids: [1], title: "Check overrides at runtime" }] };
  }) as Ask;
}

describe("the extraction funnel", () => {
  it("cleans, triages with the 4B, extracts and consolidates with the 9B, and verifies quotes", async () => {
    const calls: AskOptions<unknown>[] = [];
    const progress: string[] = [];
    const result = await extractWith(thread, fakeAsk(calls), (stage, done, total) => { progress.push(`${stage}:${done}/${total}`); });

    expect(calls.map((c) => `${c.stage}:${c.model}`)).toEqual(["triage:qwen3.5:4b", "extract:qwen3.5:9b", "consolidate:qwen3.5:9b"]);
    expect(progress).toContain("triage:1/1");
    expect(progress.at(-1)).toBe("consolidate:1/1");

    // The "+1" post is filtered before any model sees it, but still reported for the timeline.
    expect(calls[0]!.prompt).not.toContain("[post 4]");
    expect(result.posts.find((p) => p.postId === 4)).toMatchObject({ skipped: true, triageLabel: null });

    const [accepted, rejected] = result.decisions;
    expect(accepted).toMatchObject({ key: "d1", status: "accepted", model: "qwen3.5:9b", decidedAt: "2024-01-05T00:00:00Z" });
    expect(rejected!.key).toBe("d2");
    expect(rejected!.title).toBe("Check overrides at runtime");
    const evidence = rejected!.reasons[0]!.evidence;
    // Cited post 2, but the words are in post 3: re-attached and verified.
    expect(evidence[0]).toMatchObject({ postId: 3, verified: true });
    // Invented quote: kept, unverified.
    expect(evidence[1]).toMatchObject({ postId: 3, verified: false });
    expect(rejected!.confidence).toBe("medium");
    expect(result.models).toEqual({ triage: "qwen3.5:4b", extract: "qwen3.5:9b" });
  });

  it("never shows the model a post's quoted reply as its own words", () => {
    const prompt = triagePrompt("t", [{ id: 1, author: "a", createdAt: null, likes: 0, replyToId: null, index: 0, text: "My own words", skipped: false, skipReason: null }]);
    expect(prompt).toContain("[post 1] a:\nMy own words");
  });
});

describe("confidenceOf", () => {
  const e = (verified: boolean) => ({ postId: 1, quote: "q", verified, matchScore: verified ? 1 : 0 });
  it("is high only when every quote is verified and there are at least two", () => {
    expect(confidenceOf([e(true), e(true)])).toBe("high");
    expect(confidenceOf([e(true)])).toBe("medium");
    expect(confidenceOf([e(true), e(false)])).toBe("medium");
    expect(confidenceOf([e(false)])).toBe("low");
    expect(confidenceOf([])).toBe("low");
  });
});

describe("reachesExtraction", () => {
  it("lets the 4B's noise label drop only short posts", () => {
    expect(reachesExtraction("Thanks for the update, see you all.", "noise")).toBe(false);
    expect(reachesExtraction("word ".repeat(40), "noise")).toBe(true);
    expect(reachesExtraction("short objection", "objection")).toBe(true);
    expect(reachesExtraction("short and unlabelled", null)).toBe(true);
  });
});

describe("a failing extraction chunk", () => {
  const base = (calls: AskOptions<unknown>[]) => fakeAsk(calls);
  it("is skipped while the other chunks still produce decisions", async () => {
    let extracts = 0;
    const inner = base([]);
    const ask = (async (options: AskOptions<unknown>) => {
      if (options.stage === "extract" && extracts++ === 0) throw new Error("timeout");
      return inner(options);
    }) as Ask;
    const big: Thread = { ...thread, posts: thread.posts.map((p) => ({ ...p, body: `${p.body} ${"filler words here ".repeat(700)}` })) };
    const result = await extractWith(big, ask);
    expect(extracts).toBeGreaterThan(1);
    expect(result.decisions.length).toBeGreaterThan(0);
  });
  it("fails the run when every chunk fails", async () => {
    const inner = base([]);
    const ask = (async (options: AskOptions<unknown>) => {
      if (options.stage === "extract") throw new Error("model down");
      return inner(options);
    }) as Ask;
    await expect(extractWith(thread, ask)).rejects.toThrow("Every extraction chunk failed: model down");
  });
});
