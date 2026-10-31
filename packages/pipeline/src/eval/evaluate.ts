// The self-evaluation: how many of the PEP's rejected ideas did we recover from the discussion alone,
// and do our reasons agree? Code shortlists the 3 closest decisions by shared words; the 9B model judges.

import type {
  EvalMatch,
  EvalResult,
  ExtractedDecision,
  ExtractionResult,
  GroundTruthItem,
  LlmCallStore,
  ReasonAgreement,
} from "@dejaview/shared";
import { z } from "zod";
import { extractModel } from "../config.js";
import { createAsk, type Ask } from "../llm/ask.js";
import { memoryLlmStore } from "../store.js";
import { contentWords, truncate } from "../text.js";
import { fetchPep, parseRejectedIdeas } from "./pep.js";

export const SHORTLIST = 3;

const schema = {
  type: "object",
  properties: {
    best: { type: "integer" },
    reasons_agree: { type: "string", enum: ["yes", "partial", "no"] },
  },
  required: ["best", "reasons_agree"],
};

const responseSchema = z.object({ best: z.number().int(), reasons_agree: z.enum(["yes", "partial", "no"]) });

function decisionText(d: ExtractedDecision): string {
  return `${d.title}. ${d.summary} ${d.reasons.map((r) => r.text).join(" ")}`;
}

/** Shared meaningful words, scaled by size (a cosine-like overlap). */
export function overlap(a: string, b: string): number {
  const wa = contentWords(a);
  const wb = contentWords(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.sqrt(wa.size * wb.size);
}

export function shortlist(item: GroundTruthItem, decisions: ExtractedDecision[], size = SHORTLIST): ExtractedDecision[] {
  const target = `${item.title}. ${item.text}`;
  return decisions
    .map((d, i) => ({ d, i, score: overlap(target, decisionText(d)) }))
    .sort((x, y) => y.score - x.score || x.i - y.i)
    .slice(0, size)
    .map((x) => x.d);
}

export function judgePrompt(item: GroundTruthItem, candidates: ExtractedDecision[]): string {
  const list = candidates
    .map((d, i) => `${i}. ${d.title} [${d.status}] - ${d.summary}${d.reasons.length ? ` Reasons: ${d.reasons.map((r) => r.text).join("; ")}` : ""}`)
    .join("\n");
  return `A Python Enhancement Proposal lists this idea as rejected:
Title: ${item.title}
Text: ${truncate(item.text, 1500)}

Ideas found by reading the public discussion:
${list}

best: the number of the idea that is the SAME idea as the rejected one, or -1 if none of them is.
reasons_agree: if there is a match, do its reasons agree with the reason the proposal gives?
"yes" (same reason), "partial" (overlapping), "no" (different). If best is -1, answer "no".`;
}

export async function evaluatePep(
  pepNumber: number,
  result: ExtractionResult,
  deps: { llmStore?: LlmCallStore; llmCallStore?: LlmCallStore; fetchImpl?: typeof fetch } = {},
): Promise<EvalResult> {
  const store = deps.llmStore ?? deps.llmCallStore ?? memoryLlmStore();
  const groundTruth = parseRejectedIdeas(await fetchPep(pepNumber, deps.fetchImpl));
  return evaluateWith(pepNumber, groundTruth, result, createAsk(store));
}

const AGREEMENT_SCORE: Record<ReasonAgreement, number> = { yes: 1, partial: 0.5, no: 0 };

export async function evaluateWith(
  pepNumber: number,
  groundTruth: GroundTruthItem[],
  result: ExtractionResult,
  ask: Ask,
): Promise<EvalResult> {
  const matches: EvalMatch[] = [];
  for (const item of groundTruth) {
    const candidates = shortlist(item, result.decisions);
    if (candidates.length === 0) {
      matches.push({ groundTruth: item, decisionKey: null, reasonAgreement: null });
      continue;
    }
    const verdict = await ask({ model: extractModel(), stage: "eval", prompt: judgePrompt(item, candidates), jsonSchema: schema, responseSchema });
    const match = verdict.best >= 0 ? candidates[verdict.best] : undefined;
    matches.push({
      groundTruth: item,
      decisionKey: match ? match.key : null,
      reasonAgreement: match ? verdict.reasons_agree : null,
    });
  }

  const matched = matches.filter((m) => m.decisionKey !== null);
  const matchedKeys = new Set(matched.map((m) => m.decisionKey));
  const agreement = matched.reduce((sum, m) => sum + AGREEMENT_SCORE[m.reasonAgreement ?? "no"], 0);
  return {
    pepNumber,
    groundTruth,
    matches,
    recall: groundTruth.length ? matched.length / groundTruth.length : 0,
    reasonAgreement: matched.length ? agreement / matched.length : 0,
    extraIdeas: result.decisions.filter((d) => (d.status === "rejected" || d.status === "withdrawn") && !matchedKeys.has(d.key)).length,
  };
}
