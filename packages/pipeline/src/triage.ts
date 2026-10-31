// Stage 2 — triage with the small model (qwen3.5:4b). Labels each post so the big model only reads
// posts that propose, object, decide or explain. Many posts, simple task: speed beats depth here.

import { TRIAGE_LABELS, type TriageLabel } from "@dejaview/shared";
import { z } from "zod";
import type { CleanPost } from "./clean.js";
import { triageModel } from "./config.js";
import type { Ask } from "./llm/ask.js";
import { truncate } from "./text.js";

export const TRIAGE_BATCH = 5;
const POST_CHARS = 1200;

const schema = {
  type: "object",
  properties: {
    labels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          post_id: { type: "integer" },
          label: { type: "string", enum: [...TRIAGE_LABELS] },
        },
        required: ["post_id", "label"],
      },
    },
  },
  required: ["labels"],
};

const responseSchema = z.object({
  labels: z.array(z.object({ post_id: z.number().int(), label: z.enum(TRIAGE_LABELS) })),
});

export function triagePrompt(topicTitle: string, posts: CleanPost[]): string {
  const body = posts
    .map((p) => `[post ${p.id}] ${p.author}:\n${truncate(p.text, POST_CHARS)}`)
    .join("\n\n");
  return `You label posts from a public discussion about: ${topicTitle}

Give every post exactly one label:
- proposal: suggests a new idea, feature, design or change
- alternative: suggests a different way to do something already proposed
- objection: argues against an idea, points out a problem, or votes -1
- support: agrees with or argues for an idea, or votes +1
- decision: announces a final outcome (accepted, rejected, withdrawn, deferred)
- question: asks something without arguing for or against
- noise: greetings, thanks, off-topic, meta talk

Examples:
"I am -1 on this, it breaks old code." -> objection
"Why not spell it 'x as y' instead?" -> alternative
"The Steering Council has decided to accept this PEP." -> decision
"Thanks for writing this up!" -> noise

Posts:

${body}

Answer with one label per post, using each post's number as post_id.`;
}

/** Labels for every post given. A post the model forgot gets null (it is kept, not dropped). */
export async function triage(
  ask: Ask,
  topicTitle: string,
  posts: CleanPost[],
  onBatch?: (done: number, total: number) => Promise<void> | void,
): Promise<Map<number, TriageLabel | null>> {
  const labels = new Map<number, TriageLabel | null>();
  const total = Math.ceil(posts.length / TRIAGE_BATCH);
  for (let i = 0; i < posts.length; i += TRIAGE_BATCH) {
    const batch = posts.slice(i, i + TRIAGE_BATCH);
    const answer = await ask({
      model: triageModel(),
      stage: "triage",
      prompt: triagePrompt(topicTitle, batch),
      jsonSchema: schema,
      responseSchema,
    });
    const ids = new Set(batch.map((p) => p.id));
    for (const p of batch) labels.set(p.id, null);
    for (const { post_id, label } of answer.labels) if (ids.has(post_id)) labels.set(post_id, label);
    await onBatch?.(i / TRIAGE_BATCH + 1, total);
  }
  return labels;
}
