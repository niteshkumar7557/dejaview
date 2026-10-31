import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { threadFromJson, threadFromText, threadFromUpload } from "./upload.js";

describe("threadFromJson", () => {
  it("reads an array of posts", () => {
    const thread = threadFromJson(
      JSON.stringify([
        { author: "alice", created_at: "2024-01-01T00:00:00Z", body: "We should use a dict." },
        { author: "bob", created_at: "2024-01-02T00:00:00Z", body: "A list is simpler." },
      ]),
      { topicSlug: "pep-999" },
    );

    expect(thread.source.kind).toBe("upload");
    expect(thread.topic.slug).toBe("pep-999");
    expect(thread.posts).toHaveLength(2);
    expect(thread.posts[0]?.author).toBe("alice");
    expect(thread.posts[0]?.body).toBe("We should use a dict.");
    expect(thread.posts[0]?.createdAt).toBe("2024-01-01T00:00:00Z");
    expect(thread.posts[1]?.id).toBe(2);
  });

  it("reads an object with a posts array", () => {
    const thread = threadFromJson(
      JSON.stringify({ posts: [{ author: "carol", body: "Rejected because of the GIL." }] }),
    );
    expect(thread.posts).toHaveLength(1);
    expect(thread.posts[0]?.author).toBe("carol");
  });

  it("accepts the different spellings of the keys", () => {
    const thread = threadFromJson(
      JSON.stringify([
        { user: "dave", createdAt: "2024-03-03T00:00:00Z", text: "Body text" },
        { username: "erin", date: "2024-03-04T00:00:00Z", content: "Body content" },
      ]),
    );
    expect(thread.posts[0]?.author).toBe("dave");
    expect(thread.posts[0]?.body).toBe("Body text");
    expect(thread.posts[0]?.createdAt).toBe("2024-03-03T00:00:00Z");
    expect(thread.posts[1]?.author).toBe("erin");
    expect(thread.posts[1]?.body).toBe("Body content");
  });

  it("keeps the ids the file already has", () => {
    const thread = threadFromJson(
      JSON.stringify([{ id: 4812, author: "frank", body: "Quoted." }]),
    );
    expect(thread.posts[0]?.id).toBe(4812);
    expect(thread.posts[0]?.externalId).toBe("4812");
  });

  it("refuses input that is not a list of posts", () => {
    expect(() => threadFromJson("{ not json")).toThrow(/not valid JSON/);
    expect(() => threadFromJson(JSON.stringify({ title: "no posts here" }))).toThrow(/posts/);
  });
});

describe("threadFromText", () => {
  it("splits on the post separator and reads the author header", () => {
    const thread = threadFromText(
      ["Author: alice", "We should use a dict.", "---", "**bob**", "A list is simpler."].join("\n"),
      { topicSlug: "pep-999" },
    );

    expect(thread.posts).toHaveLength(2);
    expect(thread.posts[0]?.author).toBe("alice");
    expect(thread.posts[0]?.body).toBe("We should use a dict.");
    expect(thread.posts[1]?.author).toBe("bob");
    expect(thread.posts[1]?.body).toBe("A list is simpler.");
    expect(thread.posts[0]?.format).toBe("markdown");
  });

  it("treats a file without a separator as one post", () => {
    const thread = threadFromText("Just one long thought without any separator.");
    expect(thread.posts).toHaveLength(1);
    expect(thread.posts[0]?.author).toBe("unknown");
    expect(thread.posts[0]?.body).toBe("Just one long thought without any separator.");
  });

  it("keeps markdown headings in the body", () => {
    const thread = threadFromText("# Rejected Ideas\n\n- no annotations\n- no \`__init__\`");
    expect(thread.posts[0]?.body).toContain("# Rejected Ideas");
  });

  it("reads plain text as plain text", () => {
    const thread = threadFromText("Author: alice\nhello", {}, "text");
    expect(thread.posts[0]?.format).toBe("text");
  });
});

describe("threadFromUpload", () => {
  it("picks the reader from the file name", () => {
    const dir = mkdtempSync(join(tmpdir(), "dejaview-ingest-"));
    const jsonPath = join(dir, "thread.json");
    writeFileSync(jsonPath, JSON.stringify([{ author: "alice", body: "hi" }]), "utf8");
    const thread = threadFromUpload(jsonPath);
    expect(thread.posts[0]?.author).toBe("alice");

    const mdPath = join(dir, "thread.md");
    writeFileSync(mdPath, "Author: alice\nhello", "utf8");
    const markdown = threadFromUpload(mdPath);
    expect(markdown.posts[0]?.author).toBe("alice");
    expect(markdown.posts[0]?.format).toBe("markdown");

    const txtPath = join(dir, "thread.txt");
    writeFileSync(txtPath, "Author: alice\nhello", "utf8");
    expect(threadFromUpload(txtPath).posts[0]?.format).toBe("text");
  });

  it("sniffs a JSON file that is not named .json", () => {
    const dir = mkdtempSync(join(tmpdir(), "dejaview-ingest-"));
    const path = join(dir, "thread.txt");
    writeFileSync(path, JSON.stringify([{ author: "alice", body: "hi" }]), "utf8");
    expect(threadFromUpload(path).posts[0]?.author).toBe("alice");
  });
});
