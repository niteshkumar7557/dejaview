// Turns the dataset rows into the contract's API shapes. Every count and ratio is computed here.

import type {
  DecisionCard,
  DecisionSummary,
  EvalRunView,
  LlmCallView,
  TimelinePost,
  TopicDetail,
  TopicRef,
  TopicSummary,
} from "@dejaview/shared";
import { decisions, evalRuns, MODEL_EXTRACT, MODEL_TRIAGE, type MockDecision, type MockEvalRun, topics } from "./dataset";
import { buildThread } from "./threads";

const threads = new Map<string, TimelinePost[]>();

function topicOf(slug: string) {
  return topics.find((t) => t.slug === slug) ?? null;
}

function topicRef(slug: string): TopicRef {
  const t = topicOf(slug)!;
  return { slug: t.slug, title: t.title, pepNumber: t.pepNumber };
}

export function timeline(slug: string): TimelinePost[] | null {
  const topic = topicOf(slug);
  if (!topic) return null;
  if (!threads.has(slug)) threads.set(slug, buildThread(topic));
  return threads.get(slug)!;
}

function evidenceOf(d: MockDecision) {
  return d.reasons.flatMap((r) => r.quotes);
}

export function toDecisionSummary(d: MockDecision): DecisionSummary {
  const quotes = evidenceOf(d);
  return {
    id: d.id,
    topic: topicRef(d.topicSlug),
    title: d.title,
    status: d.status,
    confidence: d.confidence,
    reasons: d.reasons.map((r) => r.text),
    anchors: d.anchors,
    verifiedEvidence: quotes.filter((q) => q.verified !== false).length,
    totalEvidence: quotes.length,
  };
}

function latestEval(slug: string): EvalRunView | null {
  const runs = evalRuns.filter((r) => r.topicSlug === slug).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs[0] ? toEvalRunView(runs[0]) : null;
}

export function toTopicSummary(slug: string): TopicSummary {
  const t = topicOf(slug)!;
  const own = decisions.filter((d) => d.topicSlug === slug);
  return {
    ...topicRef(slug),
    decisionCount: own.length,
    rejectedCount: own.filter((d) => d.status === "rejected").length,
    sourceCount: t.sources.length,
    lastRecall: latestEval(slug)?.recall ?? null,
  };
}

export function toTopicDetail(slug: string): TopicDetail | null {
  const t = topicOf(slug);
  if (!t) return null;
  return {
    ...toTopicSummary(slug),
    sources: t.sources,
    decisions: decisions.filter((d) => d.topicSlug === slug).map(toDecisionSummary),
  };
}

export function toDecisionCard(id: number): DecisionCard | null {
  const d = decisions.find((x) => x.id === id);
  if (!d) return null;
  const posts = timeline(d.topicSlug)!;
  const reasons = d.reasons.map((r, ri) => ({
    id: d.id * 10 + ri + 1,
    text: r.text,
    evidence: r.quotes.map((q, qi) => {
      const post = posts.find((p) => p.id === q.post)!;
      return {
        id: d.id * 100 + ri * 10 + qi + 1,
        postId: q.post,
        quote: q.quote,
        verified: q.verified !== false,
        matchScore: q.verified === false ? (q.score ?? 0.5) : 1,
        author: post.author,
        createdAt: post.createdAt,
        postUrl: post.url,
      };
    }),
  }));
  const people = [...new Set(reasons.flatMap((r) => r.evidence.map((e) => e.author)))];
  return {
    id: d.id,
    topic: topicRef(d.topicSlug),
    title: d.title,
    kind: d.kind,
    status: d.status,
    summary: d.summary,
    confidence: d.confidence,
    decidedAt: d.decidedAt,
    model: MODEL_EXTRACT,
    reasons,
    anchors: d.anchors,
    people,
  };
}

export function toEvalRunView(run: MockEvalRun): EvalRunView {
  const t = topicOf(run.topicSlug)!;
  const matched = run.items.filter((i) => i.decisionId !== null);
  const yes = matched.filter((i) => i.agreement === "yes").length;
  const partial = matched.filter((i) => i.agreement === "partial").length;
  const matchedIds = new Set(matched.map((i) => i.decisionId));
  const extraIdeas = decisions.filter(
    (d) => d.topicSlug === run.topicSlug && d.status === "rejected" && !matchedIds.has(d.id),
  ).length;
  return {
    id: run.id,
    topic: topicRef(run.topicSlug),
    createdAt: run.createdAt,
    pepNumber: t.pepNumber,
    groundTruth: run.items.map((i) => i.item),
    matches: run.items.map((i) => ({
      groundTruth: i.item,
      decisionKey: i.decisionId === null ? null : `d${i.decisionId}`,
      reasonAgreement: i.agreement,
    })),
    recall: matched.length / run.items.length,
    reasonAgreement: matched.length ? (yes + 0.5 * partial) / matched.length : 0,
    extraIdeas,
  };
}

export function llmCallsFor(id: number): LlmCallView[] {
  const d = decisions.find((x) => x.id === id);
  if (!d) return [];
  const card = toDecisionCard(id)!;
  const postList = [...new Set(card.reasons.flatMap((r) => r.evidence.map((e) => `#${e.postId}`)))].join(", ");
  const base = Date.parse("2026-10-31T22:10:00Z") + id * 60_000;
  return [
    {
      id: id * 10 + 1, model: MODEL_TRIAGE, stage: "triage", durationMs: 4_820,
      prompt: `Label each post as proposal, alternative, objection, support, decision, question or noise.\nPosts: ${postList}`,
      response: { labels: card.reasons.flatMap((r) => r.evidence.map((e) => ({ post: e.postId, label: "objection" }))) },
      createdAt: new Date(base).toISOString(),
    },
    {
      id: id * 10 + 2, model: MODEL_EXTRACT, stage: "extract", durationMs: 41_300,
      prompt: `Extract every idea discussed in posts ${postList}, with its status, reasons and verbatim quotes of at most 40 words.`,
      response: { ideas: [{ title: d.title, status: d.status, reasons: d.reasons.map((r) => r.text) }] },
      createdAt: new Date(base + 30_000).toISOString(),
    },
    {
      id: id * 10 + 3, model: MODEL_EXTRACT, stage: "consolidate", durationMs: 12_650,
      prompt: "Merge duplicate ideas across chunks. Keep the latest decision as the status.",
      response: { decisions: [{ key: `d${id}`, title: d.title, status: d.status }] },
      createdAt: new Date(base + 90_000).toISOString(),
    },
  ];
}

export const allTopicSlugs = () => topics.map((t) => t.slug);
export const allDecisions = () => decisions;
export const allEvalRuns = () => evalRuns.map(toEvalRunView);
