// Stage 1a — clean (no model). Turns every post into plain text without quoted replies, and marks
// posts that can't hold a decision ("+1", "thanks", emoji, exact repeats) as skipped. Skipped posts
// are kept and returned, so the dashboard timeline can show them greyed out.

import type { ThreadPost } from "@dejaview/shared";
import { htmlToText, normalize, stripMarkdownQuotes, words } from "./text.js";

export interface CleanPost {
  id: number;
  author: string;
  createdAt: string | null;
  likes: number;
  replyToId: number | null;
  /** Position in the thread, 0-based. */
  index: number;
  text: string;
  skipped: boolean;
  skipReason: string | null;
}

const TRIVIAL = /^(\+1|-1|thanks?( you)?|thank you|ty|lgtm|agreed|same|me too|nice|great|cool|yes|no)[.! ]*$/i;
const MIN_WORDS = 5;

export function postText(post: ThreadPost): string {
  if (post.format === "html") return htmlToText(post.body);
  if (post.format === "markdown") return stripMarkdownQuotes(post.body);
  return post.body.trim();
}

export function cleanPosts(posts: ThreadPost[]): CleanPost[] {
  const seen = new Set<string>();
  return posts.map((post, index) => {
    const text = postText(post);
    const key = normalize(text);
    let skipReason: string | null = null;
    if (!key) skipReason = "empty";
    else if (TRIVIAL.test(text.trim())) skipReason = "trivial";
    else if (words(text).length < MIN_WORDS) skipReason = "too short";
    else if (seen.has(key)) skipReason = "duplicate";
    seen.add(key);
    return {
      id: post.id,
      author: post.author,
      createdAt: post.createdAt,
      likes: post.likes ?? 0,
      replyToId: post.replyToId ?? null,
      index,
      text,
      skipped: skipReason !== null,
      skipReason,
    };
  });
}
