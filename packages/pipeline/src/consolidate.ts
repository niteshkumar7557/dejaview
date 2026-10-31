// Stage 5 — consolidate with the big model (qwen3.5:9b). The same idea often appears in several
// chunks under slightly different titles. The model sees only the titles and reasons (a small input)
// and says which ones are the same idea; code then merges them and keeps every quote.

import { z } from "zod";
import { extractModel } from "./config.js";
import type { Ask } from "./llm/ask.js";

export interface Candidate {
  title: string;
  status: string;
  reasons: string[];
}

const schema = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ids: { type: "array", items: { type: "integer" } },
          title: { type: "string" },
        },
        required: ["ids", "title"],
      },
    },
  },
  required: ["groups"],
};

const responseSchema = z.object({
  groups: z.array(z.object({ ids: z.array(z.number().int()), title: z.string() })),
});

export function consolidatePrompt(topicTitle: string, candidates: Candidate[]): string {
  const list = candidates
    .map((c, i) => `${i}. ${c.title} [${c.status}]${c.reasons.length ? ` - ${c.reasons.join("; ")}` : ""}`)
    .join("\n");
  return `These ideas were found in different parts of one discussion about: ${topicTitle}
Some are the same idea written differently.

${list}

Group the numbers that describe the SAME idea. Every number must appear in exactly one group; an idea
with no duplicate is a group of one. Give each group the clearest, most specific title.`;
}

export interface Group {
  members: number[];
  title: string;
}

/**
 * Groups duplicate candidates. One candidate needs no model call. Whatever the model returns, every
 * candidate ends up in exactly one group: unknown numbers are ignored, repeats keep their first
 * group, and forgotten ones become groups of their own.
 */
export async function consolidate(ask: Ask, topicTitle: string, candidates: Candidate[]): Promise<Group[]> {
  if (candidates.length <= 1) return candidates.map((c, i) => ({ members: [i], title: c.title }));
  const answer = await ask({
    model: extractModel(),
    stage: "consolidate",
    prompt: consolidatePrompt(topicTitle, candidates),
    jsonSchema: schema,
    responseSchema,
  });
  return normalizeGroups(answer.groups, candidates);
}

export function normalizeGroups(groups: { ids: number[]; title: string }[], candidates: Candidate[]): Group[] {
  const used = new Set<number>();
  const result: Group[] = [];
  for (const group of groups) {
    const members = group.ids.filter((id) => id >= 0 && id < candidates.length && !used.has(id));
    if (members.length === 0) continue;
    for (const id of members) used.add(id);
    const title = group.title.trim() || (candidates[members[0] as number] as Candidate).title;
    result.push({ members, title });
  }
  candidates.forEach((c, i) => {
    if (!used.has(i)) result.push({ members: [i], title: c.title });
  });
  return result;
}
