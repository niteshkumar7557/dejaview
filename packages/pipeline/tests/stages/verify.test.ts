import { describe, expect, it } from "vitest";
import { matchScore, verifyQuote } from "../../src/verify.js";

const posts = [
  { id: 1, text: "I think a runtime check would slow every call, so I'm against it." },
  { id: 2, text: "The type checker can enforce this statically without any cost." },
];

describe("matchScore", () => {
  it("is 1 for an exact quote, ignoring case and punctuation", () => {
    expect(matchScore("A runtime check would slow EVERY call", posts[0]!.text)).toBe(1);
  });
  it("is high for a near-exact quote and low for an invented one", () => {
    expect(matchScore("a runtime check would slow down every call", posts[0]!.text)).toBeGreaterThanOrEqual(0.85);
    expect(matchScore("this idea is perfect and everyone loves it", posts[0]!.text)).toBeLessThan(0.5);
  });
});

describe("verifyQuote", () => {
  it("verifies a quote in the cited post", () => {
    expect(verifyQuote("runtime check would slow every call", 1, posts)).toEqual({ postId: 1, quote: "runtime check would slow every call", verified: true, matchScore: 1 });
  });
  it("re-attaches a quote the model cited from the wrong post", () => {
    const e = verifyQuote("enforce this statically without any cost", 1, posts);
    expect(e.postId).toBe(2);
    expect(e.verified).toBe(true);
  });
  it("marks an invented quote unverified and keeps the model's citation", () => {
    const e = verifyQuote("everyone agreed this is the best design ever", 1, posts);
    expect(e.verified).toBe(false);
    expect(e.postId).toBe(1);
  });
});
