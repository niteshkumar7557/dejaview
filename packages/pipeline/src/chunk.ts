// Groups the posts that matter into windows small enough for the model (num_ctx is 8192 tokens, and
// the prompt and the answer need room too). Windows overlap by a couple of posts so an argument that
// spans a boundary is seen whole at least once.

import { estimateTokens } from "./text.js";

// About 3,500 tokens of posts + ~400 of instructions + up to ~2,000 for the answer stays under num_ctx
// (8,192) even when code-heavy text uses more tokens than the 4-characters-per-token estimate.
export const CHUNK_TOKENS = 3500;
export const OVERLAP_POSTS = 3;

export function chunkPosts<T>(posts: T[], render: (post: T) => string, maxTokens = CHUNK_TOKENS, overlap = OVERLAP_POSTS): T[][] {
  const chunks: T[][] = [];
  let start = 0;
  while (start < posts.length) {
    let end = start;
    let tokens = 0;
    // Always take at least one post, even if it alone is over the budget (it is truncated when rendered).
    while (end < posts.length) {
      const cost = estimateTokens(render(posts[end] as T));
      if (end > start && tokens + cost > maxTokens) break;
      tokens += cost;
      end += 1;
    }
    chunks.push(posts.slice(start, end));
    if (end >= posts.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}
