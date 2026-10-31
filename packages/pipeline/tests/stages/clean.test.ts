import type { ThreadPost } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { cleanPosts, postText } from "../../src/clean.js";
import { htmlToText, normalize, stripMarkdownQuotes } from "../../src/text.js";

const post = (id: number, body: string, format: ThreadPost["format"] = "html"): ThreadPost => ({
  id, externalId: String(id), author: `user${id}`, createdAt: null, url: null, body, format,
});

describe("htmlToText", () => {
  it("removes Discourse quote blocks so a reply is not credited with what it quotes", () => {
    const html = '<aside class="quote no-group" data-username="a"><div class="title">a:</div><blockquote><p>old idea</p></blockquote></aside><p>My answer here.</p>';
    expect(htmlToText(html)).toBe("My answer here.");
  });
  it("keeps code, turns paragraphs into lines and decodes entities", () => {
    expect(htmlToText("<p>Use <code>typing.override</code> &amp; more</p><p>Second</p>")).toBe("Use typing.override & more\nSecond");
  });
});

describe("stripMarkdownQuotes", () => {
  it("drops quoted lines from GitHub Markdown", () => {
    expect(stripMarkdownQuotes("> you said this\nI disagree.")).toBe("I disagree.");
  });
});

describe("normalize", () => {
  it("ignores case, curly quotes and punctuation", () => {
    expect(normalize("It’s “FAST”, isn't it?")).toBe(normalize("its fast isnt it"));
  });
});

describe("cleanPosts", () => {
  it("skips trivial, too short and duplicate posts but keeps them in the list", () => {
    const posts = [
      post(1, "<p>I propose adding a new decorator to the typing module.</p>"),
      post(2, "<p>+1</p>"),
      post(3, "<p>Thanks!</p>"),
      post(4, "<p>I propose adding a new decorator to the typing module.</p>"),
      post(5, "<p>ok sure</p>"),
    ];
    const cleaned = cleanPosts(posts);
    expect(cleaned).toHaveLength(5);
    expect(cleaned.map((p) => p.skipReason)).toEqual([null, "trivial", "trivial", "duplicate", "too short"]);
  });
  it("reads plain text and Markdown bodies", () => {
    expect(postText(post(1, "> q\nAnswer", "markdown"))).toBe("Answer");
    expect(postText(post(2, "  plain  ", "text"))).toBe("plain");
  });
});
