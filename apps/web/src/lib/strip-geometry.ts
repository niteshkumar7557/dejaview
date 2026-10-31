import type { TimelinePost } from "@dejaview/shared";

export type TickKind = "skipped" | "read" | "evidence";

export interface Tick {
  postId: number;
  x: number;
  h: number;
  kind: TickKind;
  decisionIds: number[];
}

const STUB = 4;
const MIN_READ = 6;

/**
 * One tick per post in thread order: x centred in its slot, height from the signal score.
 * The pipeline's scores are not 0..1 (PEP 701's go up to 11), so heights are scaled by the thread's
 * highest score: the strongest post fills the strip and nothing can grow past it. Dividing by at least 1
 * keeps a thread of small scores from being stretched.
 */
export function stripGeometry(posts: TimelinePost[], width: number, height: number): Tick[] {
  const slot = posts.length ? width / posts.length : 0;
  const top = Math.max(1, ...posts.map((p) => p.signalScore ?? 0));
  return posts.map((p, i) => {
    const kind: TickKind = p.skipped ? "skipped" : p.decisionIds.length ? "evidence" : "read";
    const h = p.skipped ? STUB : Math.max(MIN_READ, Math.round(((p.signalScore ?? 0) / top) * height));
    return { postId: p.id, x: (i + 0.5) * slot, h, kind, decisionIds: p.decisionIds };
  });
}

export function stripCounts(posts: TimelinePost[]): { total: number; read: number; evidence: number } {
  return {
    total: posts.length,
    read: posts.filter((p) => !p.skipped).length,
    evidence: posts.filter((p) => p.decisionIds.length > 0).length,
  };
}
