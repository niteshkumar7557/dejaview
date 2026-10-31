// Adapter for the organizers' dataset. We do not know its format in advance, so we read
// three shapes: a JSON array of posts, Markdown, and plain text.
//
// Every format uses the same post separator (a line of three or more dashes) and the same
// author header (Author: x, **x**, *x* or @x on the first line of the post).

import { readFileSync } from "node:fs";
import type { Thread, ThreadPost } from "@dejaview/shared";

export interface UploadOptions {
  /** Topic slug in our own naming, e.g. "pep-701". */
  topicSlug?: string;
  pepNumber?: number | null;
  /** Topic title; defaults to the slug. */
  title?: string;
  /** Where the file came from, for the source row. */
  sourceUrl?: string | null;
}

const SEPARATOR = /^\s*---+\s*$/m;
const AUTHOR_PATTERNS: RegExp[] = [
  /^author\s*:\s*(.+)$/i,
  /^\*\*(.+)\*\*$/,
  /^\*(.+)\*$/,
  /^@([A-Za-z0-9_.-]+)$/,
];

interface RawJsonPost {
  id?: number | string | null;
  author?: string | null;
  user?: string | null;
  username?: string | null;
  name?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  date?: string | null;
  timestamp?: string | null;
  body?: string | null;
  text?: string | null;
  content?: string | null;
  url?: string | null;
  html_url?: string | null;
  permalink?: string | null;
  likes?: number | null;
}

function firstString(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Markdown-looking bodies are markdown, bodies with HTML tags are HTML, otherwise plain text. */
function guessFormat(body: string): "html" | "markdown" | "text" {
  if (/<[a-z][^>]*>/i.test(body)) return "html";
  if (/^#{1,6}\s|\*\*|^\s*[-*]\s|```|\[[^\]]+\]\([^)]+\)/m.test(body)) return "markdown";
  return "text";
}

function splitBlocks(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

/** Pulls the author header off the first line of a block and returns the rest as the body. */
function extractAuthor(block: string): { author: string; body: string } {
  const lines = block.split("\n");
  const firstIndex = lines.findIndex((line) => line.trim().length > 0);
  if (firstIndex === -1) return { author: "unknown", body: "" };

  const firstLine = (lines[firstIndex] ?? "").trim();
  for (const pattern of AUTHOR_PATTERNS) {
    const match = pattern.exec(firstLine);
    if (match && match[1]) {
      const body = lines
        .slice(firstIndex + 1)
        .join("\n")
        .trim();
      return { author: match[1].trim(), body };
    }
  }
  return { author: "unknown", body: block.trim() };
}

function postsFromBlocks(blocks: string[], format: "markdown" | "text"): ThreadPost[] {
  return blocks.map((block, index) => {
    const { author, body } = extractAuthor(block);
    return {
      id: index + 1,
      externalId: String(index + 1),
      author,
      createdAt: null,
      url: null,
      body,
      format,
      replyToId: null,
    };
  });
}

/** Reads a JSON array of posts, or an object with a "posts" array. */
export function threadFromJson(text: string, options: UploadOptions = {}): Thread {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Upload is not valid JSON");
  }

  let rawPosts: RawJsonPost[];
  if (Array.isArray(parsed)) {
    rawPosts = parsed as RawJsonPost[];
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { posts?: unknown }).posts)) {
    rawPosts = (parsed as { posts: RawJsonPost[] }).posts;
  } else {
    throw new Error("Upload JSON must be an array of posts or an object with a \"posts\" array");
  }

  const posts: ThreadPost[] = rawPosts.map((raw, index) => {
    const body = firstString(raw.body, raw.text, raw.content) ?? "";
    const rawId = raw.id;
    const id =
      typeof rawId === "number" && Number.isFinite(rawId)
        ? rawId
        : typeof rawId === "string" && /^\d+$/.test(rawId)
          ? Number(rawId)
          : index + 1;
    return {
      id,
      externalId: String(rawId ?? id),
      author: firstString(raw.author, raw.user, raw.username, raw.name) ?? "unknown",
      createdAt: firstString(raw.created_at, raw.createdAt, raw.date, raw.timestamp),
      url: firstString(raw.url, raw.html_url, raw.permalink),
      body,
      format: guessFormat(body),
      likes: typeof raw.likes === "number" && raw.likes > 0 ? raw.likes : undefined,
      replyToId: null,
    };
  });

  return {
    topic: {
      slug: options.topicSlug ?? "upload",
      title: options.title ?? options.topicSlug ?? "Uploaded discussion",
      pepNumber: options.pepNumber ?? null,
    },
    source: {
      kind: "upload",
      url: options.sourceUrl ?? null,
      title: options.title ?? options.topicSlug ?? "Uploaded discussion",
      externalId: null,
    },
    posts,
  };
}

/** Reads Markdown or plain text, splitting on the post separator. */
export function threadFromText(
  text: string,
  options: UploadOptions = {},
  format: "markdown" | "text" = "markdown",
): Thread {
  const posts = postsFromBlocks(splitBlocks(text), format);
  return {
    topic: {
      slug: options.topicSlug ?? "upload",
      title: options.title ?? options.topicSlug ?? "Uploaded discussion",
      pepNumber: options.pepNumber ?? null,
    },
    source: {
      kind: "upload",
      url: options.sourceUrl ?? null,
      title: options.title ?? options.topicSlug ?? "Uploaded discussion",
      externalId: null,
    },
    posts,
  };
}

/** Picks the reader from the file name, falling back to sniffing the content. */
export function threadFromUpload(filePath: string, options: UploadOptions = {}): Thread {
  const text = readFileSync(filePath, "utf8");
  const lower = filePath.toLowerCase();

  if (lower.endsWith(".json")) return threadFromJson(text, options);

  const looksLikeJson = /^\s*[[{]/.test(text);
  if (looksLikeJson) {
    try {
      return threadFromJson(text, options);
    } catch {
      // Not JSON after all: fall through to the text reader.
    }
  }

  const isMarkdown = lower.endsWith(".md") || lower.endsWith(".markdown");
  return threadFromText(text, options, isMarkdown ? "markdown" : "text");
}
