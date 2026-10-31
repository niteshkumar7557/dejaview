// The whole funnel for one thread:
//   clean + score (code) → triage (4B) → extract per chunk (9B) → verify quotes (code) → consolidate (9B)
// It never reads the PEP: only the evaluation does, afterwards.

import type {
  Confidence,
  DecisionStatus,
  Evidence,
  ExtractedDecision,
  ExtractionResult,
  LlmCallStore,
  PostAnnotation,
  ProgressReporter,
  Reason,
  Thread,
  TriageLabel,
} from "@dejaview/shared";
import { chunkPosts } from "./chunk.js";
import { cleanPosts } from "./clean.js";
import { extractModel, triageModel } from "./config.js";
import { consolidate, type Group } from "./consolidate.js";
import { extractChunk, renderChunkPost, type ChunkPost, type ExtractedIdea } from "./extract.js";
import { createAsk, type Ask } from "./llm/ask.js";
import { scorePosts } from "./score.js";
import { normalize, words } from "./text.js";
import { triage } from "./triage.js";
import { verifyQuote } from "./verify.js";

/** One idea from one chunk, with its quotes already checked. */
interface CheckedIdea {
  idea: ExtractedIdea;
  reasons: Reason[];
}

export interface PostInfo {
  createdAt: string | null;
  label: TriageLabel | null;
}

export async function runExtraction(
  thread: Thread,
  deps: { llmStore: LlmCallStore; onProgress?: ProgressReporter },
): Promise<ExtractionResult> {
  return extractWith(thread, createAsk(deps.llmStore), deps.onProgress);
}

/** The funnel with an injectable Ask, so tests can run it with a fake model. */
export async function extractWith(thread: Thread, ask: Ask, onProgress?: ProgressReporter): Promise<ExtractionResult> {
  const report = async (stage: Parameters<ProgressReporter>[0], done: number, total: number) => {
    await onProgress?.(stage, done, total);
  };
  const title = thread.topic.title;

  // 1. Clean and score.
  await report("clean", 0, 1);
  const scored = scorePosts(cleanPosts(thread.posts));
  const kept = scored.filter((s) => !s.post.skipped).map((s) => s.post);
  await report("clean", 1, 1);

  // 2. Triage the posts that are still in.
  const labels = await triage(ask, title, kept, (done, total) => report("triage", done, total));
  const relevant: ChunkPost[] = kept.filter((p) => reachesExtraction(p.text, labels.get(p.id) ?? null));

  // 3 + 4. Extract per chunk, and check every quote against the posts that chunk showed the model.
  const chunks = chunkPosts(relevant, renderChunkPost);
  const checked: CheckedIdea[] = [];
  for (const [i, chunk] of chunks.entries()) {
    await report("extract", i, chunks.length);
    const ideas = await extractChunk(ask, title, chunk);
    for (const idea of ideas) checked.push({ idea, reasons: verifyReasons(idea, chunk) });
  }
  await report("extract", chunks.length, chunks.length);
  await report("verify", 1, 1);

  // 5. Merge duplicates found in different chunks.
  await report("consolidate", 0, 1);
  const groups = await consolidate(
    ask,
    title,
    checked.map((c) => ({ title: c.idea.title, status: c.idea.status, reasons: c.idea.reasons.map((r) => r.text) })),
  );
  const info = new Map<number, PostInfo>(
    thread.posts.map((p) => [p.id, { createdAt: p.createdAt, label: labels.get(p.id) ?? null }]),
  );
  const decisions = groups.map((group, i) => mergeGroup(group, checked, info, `d${i + 1}`));
  await report("consolidate", 1, 1);

  const posts: PostAnnotation[] = scored.map(({ post, score }) => ({
    postId: post.id,
    bodyClean: post.text,
    signalScore: score,
    triageLabel: labels.get(post.id) ?? null,
    skipped: post.skipped,
  }));

  return {
    topicSlug: thread.topic.slug,
    models: { triage: triageModel(), extract: extractModel() },
    posts,
    decisions,
  };
}

/** Posts at least this long reach the 9B even if the 4B called them noise. */
export const NOISE_MAX_WORDS = 40;

/**
 * Whether a post goes on to extraction. The 4B's "noise" label only removes short posts: on a real
 * PEP 698 run it labelled the PEP author's 500-word reply about the Rejected Alternatives as noise,
 * and losing that post lost a rejected idea. A wrong "keep" costs a little 9B time; a wrong "drop"
 * costs a decision.
 */
export function reachesExtraction(text: string, label: TriageLabel | null): boolean {
  return label !== "noise" || words(text).length >= NOISE_MAX_WORDS;
}

function verifyReasons(idea: ExtractedIdea, chunk: ChunkPost[]): Reason[] {
  return idea.reasons.map((reason) => ({
    text: reason.text.trim(),
    evidence: reason.evidence
      .filter((e) => e.quote.trim().length > 0)
      .map((e) => verifyQuote(e.quote.trim(), e.post_id, chunk)),
  }));
}

/** Merges the ideas of one group into one decision: reasons and quotes are unioned, never lost. */
export function mergeGroup(group: Group, checked: CheckedIdea[], info: Map<number, PostInfo>, key: string): ExtractedDecision {
  const members = group.members.map((i) => checked[i] as CheckedIdea);
  const first = members[0] as CheckedIdea;
  const status = pickStatus(members, info);
  const reasons = mergeReasons(members.flatMap((m) => m.reasons));
  const evidence = reasons.flatMap((r) => r.evidence);
  const summary = (members.find((m) => m.idea.status === status) ?? first).idea.summary.trim();
  return {
    key,
    title: group.title.trim(),
    kind: members.some((m) => m.idea.kind === "proposal") && first.idea.kind === "proposal" ? "proposal" : first.idea.kind,
    status,
    summary,
    confidence: confidenceOf(evidence),
    decidedAt: status === "open" ? null : latestDate(evidence, info),
    model: extractModel(),
    reasons,
  };
}

/**
 * The status of a merged idea. A later post labelled "decision" beats earlier opinions (for example,
 * an idea liked at first and rejected by the Steering Council later). Without one, the most common
 * status wins, ties going to the first chunk.
 */
export function pickStatus(members: CheckedIdea[], info: Map<number, PostInfo>): DecisionStatus {
  let latest: { status: DecisionStatus; at: string } | null = null;
  for (const m of members) {
    for (const e of m.reasons.flatMap((r) => r.evidence)) {
      const post = info.get(e.postId);
      if (!e.verified || post?.label !== "decision" || !post.createdAt) continue;
      if (!latest || post.createdAt > latest.at) latest = { status: m.idea.status, at: post.createdAt };
    }
  }
  if (latest) return latest.status;
  const counts = new Map<DecisionStatus, number>();
  for (const m of members) counts.set(m.idea.status, (counts.get(m.idea.status) ?? 0) + 1);
  let best = (members[0] as CheckedIdea).idea.status;
  for (const [status, n] of counts) if (n > (counts.get(best) ?? 0)) best = status;
  return best;
}

function mergeReasons(reasons: Reason[]): Reason[] {
  const byText = new Map<string, Reason>();
  for (const reason of reasons) {
    const k = normalize(reason.text);
    const existing = byText.get(k);
    if (!existing) {
      byText.set(k, { text: reason.text, evidence: dedupeEvidence(reason.evidence) });
    } else {
      existing.evidence = dedupeEvidence([...existing.evidence, ...reason.evidence]);
    }
  }
  return [...byText.values()];
}

function dedupeEvidence(evidence: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return evidence.filter((e) => {
    const k = `${e.postId}:${normalize(e.quote)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** high: every quote verified and at least two of them · low: none verified · medium: the rest. */
export function confidenceOf(evidence: Evidence[]): Confidence {
  const verified = evidence.filter((e) => e.verified).length;
  if (verified === 0) return "low";
  if (verified === evidence.length && verified >= 2) return "high";
  return "medium";
}

function latestDate(evidence: Evidence[], info: Map<number, PostInfo>): string | null {
  let latest: string | null = null;
  for (const e of evidence) {
    const at = info.get(e.postId)?.createdAt ?? null;
    if (at && (!latest || at > latest)) latest = at;
  }
  return latest;
}
