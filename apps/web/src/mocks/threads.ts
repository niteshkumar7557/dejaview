// Deterministic generator for whole discussion threads. Hand-written evidence posts (dataset.posts)
// sit at their post numbers; every other post is drawn from a seeded random stream so the thread
// strip and timeline show realistic volume without hand-writing hundreds of posts.

import { TRIAGE_LABELS, type TimelinePost, type TriageLabel } from "@dejaview/shared";
import { decisions, posts, type MockTopic } from "./dataset";

const HANDLES = [
  "mira.okafor", "tdelacroix", "h-lindqvist", "pkoenig", "sato_k", "ines.r",
  "jvanloon", "b.adeyemi", "lukas_w", "r.chandra", "ewa.n", "gpaz",
];

const SKIPPED_BODIES = ["+1", "Thanks for writing this up!", "Agreed.", "+1 from me.", "Thanks, that answers it.", "Same question here."];

// Weights for ordinary (non-evidence) posts, in TRIAGE_LABELS order:
// proposal, alternative, objection, support, decision, question, noise.
const LABEL_WEIGHTS = [0.08, 0.07, 0.06, 0.2, 0.02, 0.12, 0.45];
const SKIP_RATE = 0.38;

/** mulberry32: small, fast, deterministic PRNG. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], r: number): T {
  return items[Math.floor(r * items.length) % items.length]!;
}

function weightedLabel(r: number): TriageLabel {
  let acc = 0;
  for (let i = 0; i < TRIAGE_LABELS.length; i++) {
    acc += LABEL_WEIGHTS[i]!;
    if (r < acc) return TRIAGE_LABELS[i]!;
  }
  return "noise";
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildThread(topic: MockTopic): TimelinePost[] {
  const random = rng(topic.seed);
  const start = Date.parse(topic.start);
  const span = Date.parse(topic.end) - start;
  const ownDecisions = decisions.filter((d) => d.topicSlug === topic.slug);
  const handPosts = new Map(posts.filter((p) => p.topicSlug === topic.slug).map((p) => [p.post, p]));

  // Which decisions cite each post, and the verified quotes that must appear in its body.
  const citedBy = new Map<number, Set<number>>();
  const verifiedQuotes = new Map<number, string[]>();
  for (const d of ownDecisions) {
    for (const reason of d.reasons) {
      for (const q of reason.quotes) {
        if (!handPosts.has(q.post)) {
          throw new Error(`${topic.slug}: decision ${d.id} cites post #${q.post}, which has no entry in dataset.posts`);
        }
        citedBy.set(q.post, (citedBy.get(q.post) ?? new Set()).add(d.id));
        if (q.verified !== false) verifiedQuotes.set(q.post, [...(verifiedQuotes.get(q.post) ?? []), q.quote]);
      }
    }
  }

  const thread: TimelinePost[] = [];
  for (let n = 1; n <= topic.postCount; n++) {
    const createdAt = new Date(start + (span * (n - 1)) / Math.max(1, topic.postCount - 1)).toISOString();
    const url = `${topic.threadUrl}/${n}`;
    const hand = handPosts.get(n);
    const r1 = random();
    const r2 = random();
    const r3 = random();

    if (hand) {
      const quotes = verifiedQuotes.get(n) ?? [];
      const body = [hand.lead, ...(quotes.length ? quotes.map((q) => `${q}.`) : [pick(topic.filler, r3)])].join(" ");
      thread.push({
        id: n,
        author: n === 1 ? topic.author : hand.author,
        createdAt,
        url,
        bodyClean: body,
        signalScore: round2(0.7 + r1 * 0.3),
        triageLabel: hand.label,
        skipped: false,
        decisionIds: [...(citedBy.get(n) ?? [])].sort((a, b) => a - b),
      });
      continue;
    }

    const skipped = r1 < SKIP_RATE;
    thread.push({
      id: n,
      author: pick(HANDLES, r2),
      createdAt,
      url,
      bodyClean: skipped ? pick(SKIPPED_BODIES, r3) : pick(topic.filler, r3),
      signalScore: skipped ? null : round2(0.05 + r2 * 0.55),
      triageLabel: skipped ? null : weightedLabel(r3),
      skipped,
      decisionIds: [],
    });
  }
  return thread;
}
