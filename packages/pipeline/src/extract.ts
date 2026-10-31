// Stage 3 — extract with the big model (qwen3.5:9b). For one chunk of posts, list the ideas that were
// proposed or discussed, what happened to each, why, and a word-for-word quote for every reason.

import { DECISION_STATUSES } from "@dejaview/shared";
import { z } from "zod";
import { extractModel } from "./config.js";
import type { Ask } from "./llm/ask.js";
import { truncate } from "./text.js";

/** Longer posts are cut when shown to the model (6,000 characters ≈ 1,500 tokens, so one fits a chunk). */
export const POST_CHARS = 6000;

export interface ChunkPost {
  id: number;
  author: string;
  createdAt: string | null;
  text: string;
}

// Caps on the answer's size. On the laptop the 9B writes ~5 tokens a second, and on PEP 701 an uncapped
// answer ran past 2,500 tokens and was cut off. Ideas that recur get picked up by other chunks.
export const MAX_IDEAS = 5;
const MAX_REASONS = 2;
const MAX_QUOTES = 1;

const schema = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      maxItems: MAX_IDEAS,
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          kind: { type: "string", enum: ["proposal", "alternative"] },
          status: { type: "string", enum: [...DECISION_STATUSES] },
          summary: { type: "string" },
          reasons: {
            type: "array",
            maxItems: MAX_REASONS,
            items: {
              type: "object",
              properties: {
                text: { type: "string" },
                evidence: {
                  type: "array",
                  maxItems: MAX_QUOTES,
                  items: {
                    type: "object",
                    properties: { post_id: { type: "integer" }, quote: { type: "string" } },
                    required: ["post_id", "quote"],
                  },
                },
              },
              required: ["text", "evidence"],
            },
          },
        },
        required: ["title", "kind", "status", "summary", "reasons"],
      },
    },
  },
  required: ["ideas"],
};

const responseSchema = z.object({
  ideas: z.array(
    z.object({
      title: z.string(),
      kind: z.enum(["proposal", "alternative"]),
      status: z.enum(DECISION_STATUSES),
      summary: z.string(),
      reasons: z.array(
        z.object({
          text: z.string(),
          evidence: z.array(z.object({ post_id: z.number().int(), quote: z.string() })),
        }),
      ),
    }),
  ),
});

export type ExtractedIdea = z.infer<typeof responseSchema>["ideas"][number];

export function renderChunkPost(post: ChunkPost): string {
  const date = post.createdAt ? post.createdAt.slice(0, 10) : "unknown date";
  return `[post ${post.id}] ${post.author} (${date}):\n${truncate(post.text, POST_CHARS)}`;
}

export function extractPrompt(topicTitle: string, posts: ChunkPost[]): string {
  return `You read part of a public discussion about: ${topicTitle}

Find the ideas in these posts that were proposed or discussed: the main proposal, alternative designs,
different spellings or names, extra features people asked for, and ideas that were turned down.
List at most ${MAX_IDEAS} ideas, most important first (prefer ideas that were rejected or decided).

For each idea give:
- title: a short name for the idea itself (at most 12 words), without labels like "Rejected:" or "Proposal:"
- kind: "proposal" for the main proposal or a new feature, "alternative" for a different way of doing it
- status: "accepted" if it was adopted, "rejected" if the authors or deciders turned it down,
  "withdrawn" if its own proposer dropped it, "open" if no outcome is visible in these posts
- summary: one short sentence on what happened to the idea
- reasons: at most ${MAX_REASONS} reasons why it got that status, each with exactly one evidence item (post_id and quote).

Rules for quotes:
- Copy the quote WORD FOR WORD from the post with that post_id. Do not paraphrase, fix or shorten words.
- At most 25 words per quote. Never invent a quote.
- Only use posts shown below.

Posts:

${posts.map(renderChunkPost).join("\n\n")}

Reminder: at most ${MAX_IDEAS} ideas; give each reason one quote copied word for word (at most 25 words)
from the post with that post_id; use status "open" when no outcome is visible.`;
}

export async function extractChunk(ask: Ask, topicTitle: string, posts: ChunkPost[]): Promise<ExtractedIdea[]> {
  const answer = await ask({
    model: extractModel(),
    stage: "extract",
    prompt: extractPrompt(topicTitle, posts),
    jsonSchema: schema,
    responseSchema,
  });
  return answer.ideas.filter((idea) => idea.title.trim().length > 0);
}
