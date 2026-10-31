import { describe, expect, it } from "vitest";
import type { CleanPost } from "../../src/clean.js";
import { scorePosts, signalScore } from "../../src/score.js";

const make = (index: number, author: string, text: string, likes = 0): CleanPost => ({
  id: index + 1, author, createdAt: null, likes, replyToId: null, index, text, skipped: false, skipReason: null,
});

describe("signalScore", () => {
  const ctx = { proposer: "author", postCount: 20 };
  it("rewards decision phrases", () => {
    expect(signalScore(make(5, "x", "This was rejected instead of the alternative."), ctx))
      .toBeGreaterThan(signalScore(make(5, "x", "Looks interesting to me today."), ctx));
  });
  it("rewards the proposer, Steering Council members and the first post", () => {
    const plain = signalScore(make(5, "someone", "Some words here."), ctx);
    expect(signalScore(make(5, "author", "Some words here."), ctx)).toBeGreaterThan(plain);
    expect(signalScore(make(5, "brettcannon", "Some words here."), ctx)).toBeGreaterThan(plain);
    expect(signalScore(make(0, "someone", "Some words here."), ctx)).toBeGreaterThan(plain);
  });
});

describe("scorePosts", () => {
  it("skips a short post with no signal, keeps the first post and a decision", () => {
    const posts = [
      make(0, "author", "I propose a new decorator for marking overrides."),
      make(1, "a", "Interesting, I will read it later."),
      make(2, "c", "Nice weather in here today folks."),
      make(3, "b", "The SC has decided to accept this PEP!"),
    ];
    const scored = scorePosts(posts);
    expect(scored.map((s) => s.post.skipped)).toEqual([false, true, true, false]);
    expect(scored[1]?.post.skipReason).toBe("low signal");
  });
});
