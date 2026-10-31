// Stage 1b — signal score (no model). How likely a post is to contain a decision or the reason for
// one. Short posts with no signal at all are skipped before the models see them.

import type { CleanPost } from "./clean.js";
import { words } from "./text.js";

/** Phrases that tend to appear when something is proposed, objected to, or decided. */
const DECISION_PHRASES = [
  /\breject(ed|ing)?\b/i, /\bwithdr(a|e)wn?\b/i, /\binstead of\b/i, /\bwe (have )?decided\b/i, /(^|\s)-1\b/,
  /\bwon'?t work\b/i, /\bsteering council\b/i, /\bthe sc\b/i, /\baccept(ed|ing)?\b/i, /\balternatives?\b/i,
  /\bwhy not\b/i, /\bdefer(red)?\b/i, /\bpropos(e|al|ed)\b/i, /\bsuggest(ion|ed)?\b/i, /\bwhat about\b/i,
  /\bdownside\b/i, /\bdrawback\b/i, /\bconcern(s|ed)?\b/i, /\bbreak(s|ing)? (old|existing|backward)/i,
  /\bbackwards? compat/i, /\bconsidered\b/i, /\bprefer\b/i,
];

/** Steering Council members and long-time core developers (small hard-coded list for the demo). */
const DECIDERS = new Set([
  "brettcannon", "gvanrossum", "pablogsal", "gpshead", "yhg1s", "emilyemorehouse", "barry", "carljm",
  "ambv", "ncoghlan", "willingc", "vstinner", "serhiy-storchaka", "rhettinger", "tim.one", "markshannon",
]);

const LONG_POST_WORDS = 30;
export const SKIP_BELOW = 1;

export interface ScoreContext {
  /** The thread's first author: for a PEP thread, the PEP author. */
  proposer: string | null;
  postCount: number;
}

export function signalScore(post: CleanPost, context: ScoreContext): number {
  let score = 0;
  const phraseHits = DECISION_PHRASES.filter((pattern) => pattern.test(post.text)).length;
  score += Math.min(phraseHits, 4);
  const author = post.author.toLowerCase();
  if (context.proposer && author === context.proposer.toLowerCase()) score += 1.5;
  if (DECIDERS.has(author)) score += 1.5;
  score += Math.min(post.likes, 10) / 5;
  if (post.index === 0) score += 2;
  if (post.index >= Math.floor(context.postCount * 0.9)) score += 1;
  if (words(post.text).length >= LONG_POST_WORDS) score += 1;
  return Math.round(score * 10) / 10;
}

/** Scores every post; a post that is still in and scores below SKIP_BELOW becomes skipped. */
export function scorePosts(posts: CleanPost[]): { post: CleanPost; score: number }[] {
  const context: ScoreContext = { proposer: posts[0]?.author ?? null, postCount: posts.length };
  return posts.map((post) => {
    const score = signalScore(post, context);
    if (!post.skipped && score < SKIP_BELOW) {
      return { post: { ...post, skipped: true, skipReason: "low signal" }, score };
    }
    return { post, score };
  });
}
