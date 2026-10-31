import { describe, expect, it } from "vitest";
import { chunkPosts } from "../../src/chunk.js";

const posts = Array.from({ length: 10 }, (_, i) => ({ id: i, text: "x".repeat(400) })); // ~100 tokens each
const render = (p: { text: string }) => p.text;

describe("chunkPosts", () => {
  it("keeps every chunk within the token budget", () => {
    for (const chunk of chunkPosts(posts, render, 300, 1)) {
      expect(chunk.reduce((sum, p) => sum + p.text.length / 4, 0)).toBeLessThanOrEqual(300);
    }
  });
  it("overlaps consecutive chunks and covers every post", () => {
    const chunks = chunkPosts(posts, render, 300, 1);
    expect(chunks[0]!.at(-1)!.id).toBe(chunks[1]![0]!.id);
    expect(new Set(chunks.flat().map((p) => p.id)).size).toBe(10);
  });
  it("puts a post bigger than the budget in its own chunk instead of looping", () => {
    const chunks = chunkPosts([{ id: 0, text: "x".repeat(4000) }, { id: 1, text: "y" }], render, 100, 2);
    expect(chunks.flat().map((p) => p.id)).toContain(1);
  });
  it("returns one chunk when everything fits", () => {
    expect(chunkPosts(posts.slice(0, 2), render, 1000)).toHaveLength(1);
  });
});
