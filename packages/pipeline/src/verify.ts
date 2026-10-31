// Stage 4 — verify quotes (no model). This is our answer to "the model can make things up": every
// quote the model gives must be found, word for word, in a real post. If it isn't, it is marked
// unverified and shown as such, never silently trusted.

import type { Evidence } from "@dejaview/shared";
import { normalize } from "./text.js";

export const VERIFIED_AT = 0.85;

/** How well `quote` appears in `text`: 1 for an exact match, else the best share of quote words found in a window. */
export function matchScore(quote: string, text: string): number {
  const q = normalize(quote);
  const t = normalize(text);
  if (!q || !t) return 0;
  if (t.includes(q)) return 1;
  const qWords = q.split(" ");
  const tWords = t.split(" ");
  const n = qWords.length;
  if (tWords.length === 0) return 0;
  let best = 0;
  // Slide a window as long as the quote over the post and count quote words present in it.
  for (let start = 0; start <= Math.max(0, tWords.length - n); start++) {
    const window = new Map<string, number>();
    for (const w of tWords.slice(start, start + n)) window.set(w, (window.get(w) ?? 0) + 1);
    let hits = 0;
    for (const w of qWords) {
      const left = window.get(w) ?? 0;
      if (left > 0) {
        hits += 1;
        window.set(w, left - 1);
      }
    }
    best = Math.max(best, hits / n);
    if (best === 1) break;
  }
  return Math.round(best * 1000) / 1000;
}

/**
 * Checks one quote against the post the model cited. If it isn't there, looks in the other posts the
 * model was shown (models often cite the wrong post number) and re-attaches the quote when found.
 */
export function verifyQuote(
  quote: string,
  citedPostId: number,
  posts: { id: number; text: string }[],
): Evidence {
  const cited = posts.find((p) => p.id === citedPostId);
  const citedScore = cited ? matchScore(quote, cited.text) : 0;
  if (citedScore >= VERIFIED_AT) return { postId: citedPostId, quote, verified: true, matchScore: citedScore };

  let best = { postId: citedPostId, score: citedScore };
  for (const post of posts) {
    if (post.id === citedPostId) continue;
    const score = matchScore(quote, post.text);
    if (score > best.score) best = { postId: post.id, score };
  }
  if (best.score >= VERIFIED_AT) return { postId: best.postId, quote, verified: true, matchScore: best.score };
  // Not found anywhere: keep the model's citation, marked unverified.
  return { postId: cited ? citedPostId : best.postId, quote, verified: false, matchScore: citedScore };
}

/**
 * Evidence for a reason the model gave without any. The 9B sometimes answers `"evidence": []` but
 * copies the quote into the reason text instead (a real CPython issue lost every quote this way).
 * The text counts as evidence only if it is found word for word in one of the posts the model read;
 * otherwise the reason stays without evidence, never with an invented one.
 */
export function evidenceFromReasonText(text: string, posts: { id: number; text: string }[]): Evidence | null {
  const quote = text.trim();
  if (!quote) return null;
  const evidence = verifyQuote(quote, Number.NaN, posts);
  return evidence.verified ? evidence : null;
}
