// Discourse (discuss.python.org) adapter.
//
// The public JSON API gives us the first ~20 posts in /t/{id}.json and the ids of every
// post in post_stream.stream. The remaining posts come in batches from /t/{id}/posts.json.
// Important: that endpoint wants the *global* post ids from the stream, not post numbers —
// asking for post numbers returns an empty list instead of an error.

import type { Thread, ThreadPost } from "@dejaview/shared";
import { getJson, type IngestOptions } from "./http.js";
import { parseDiscourseUrl } from "./url.js";

const DEFAULT_BASE_URL = "https://discuss.python.org";
/** How many post ids we ask for in one /posts.json call. */
const BATCH_SIZE = 20;
/** Discourse id of the "like" action, the one that shows up in actions_summary. */
const LIKE_ACTION_ID = 2;

interface DiscoursePost {
  id: number;
  post_number: number;
  username?: string | null;
  name?: string | null;
  created_at?: string | null;
  cooked?: string | null;
  post_url?: string | null;
  reply_to_post_number?: number | null;
  actions_summary?: { id: number; name?: string; count?: number }[] | null;
}

interface DiscourseTopicResponse {
  id: number;
  slug: string;
  title: string;
  posts_count?: number;
  post_stream: { posts?: DiscoursePost[]; stream?: number[] };
}

interface DiscoursePostsResponse {
  post_stream?: { posts?: DiscoursePost[] };
}

export interface DiscourseOptions extends IngestOptions {
  /** Forum origin; defaults to discuss.python.org. */
  baseUrl?: string;
  /** Topic slug in our own naming, e.g. "pep-701". Defaults to the forum slug. */
  topicSlug?: string;
  pepNumber?: number | null;
}

function likeCount(post: DiscoursePost): number | undefined {
  const summary = post.actions_summary;
  if (!summary || summary.length === 0) return undefined;
  const like = summary.find((action) => action.id === LIKE_ACTION_ID || action.name === "like");
  const count = like?.count ?? 0;
  return count > 0 ? count : undefined;
}

function authorOf(post: DiscoursePost): string {
  return post.username?.trim() || post.name?.trim() || "unknown";
}

/** The permalink of one post, built from what the API gives us. */
function permalink(baseUrl: string, topicSlug: string, topicId: number, post: DiscoursePost): string {
  if (post.post_url) return `${baseUrl}${post.post_url}`;
  return `${baseUrl}/t/${topicSlug}/${topicId}/${post.post_number}`;
}

function toThreadPost(
  post: DiscoursePost,
  context: { baseUrl: string; topicSlug: string; topicId: number },
): ThreadPost {
  const postNumber = post.post_number;
  return {
    id: postNumber,
    externalId: String(postNumber),
    author: authorOf(post),
    createdAt: post.created_at ?? null,
    url: permalink(context.baseUrl, context.topicSlug, context.topicId, post),
    body: post.cooked ?? "",
    format: "html",
    likes: likeCount(post),
    replyToId: post.reply_to_post_number ?? null,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/** Pulls the posts we do not have yet, in batches of post ids. */
async function fetchRemainingPosts(
  topicId: number,
  missingIds: number[],
  baseUrl: string,
  options: IngestOptions,
): Promise<DiscoursePost[]> {
  const fetched: DiscoursePost[] = [];
  for (const batch of chunk(missingIds, BATCH_SIZE)) {
    const query = batch.map((id) => `post_ids[]=${id}`).join("&");
    const url = `${baseUrl}/t/${topicId}/posts.json?${query}`;
    const response = (await getJson(url, options)) as DiscoursePostsResponse;
    const posts = response.post_stream?.posts ?? [];
    // Deleted posts are still listed in the stream but resolve to nothing: skip the gap.
    fetched.push(...posts);
  }
  return fetched;
}

/**
 * Fetches a whole Discourse thread as a DejaView Thread.
 * `url` may point at a topic or at a single post inside it.
 */
export async function fetchDiscourseThread(
  url: string,
  options: DiscourseOptions = {},
): Promise<Thread> {
  const parsed = parseDiscourseUrl(url);
  if (!parsed) {
    throw new Error(`Not a Discourse topic URL: ${url}`);
  }
  const baseUrl = (options.baseUrl ?? parsed.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const topicId = parsed.topicId;

  const topicResponse = (await getJson(`${baseUrl}/t/${topicId}.json`, options)) as DiscourseTopicResponse;
  const topicSlug = topicResponse.slug || parsed.slug || String(topicId);
  const firstPage = topicResponse.post_stream?.posts ?? [];
  const stream = topicResponse.post_stream?.stream ?? firstPage.map((post) => post.id);
  const seen = new Set(firstPage.map((post) => post.id));
  const missingIds = stream.filter((id) => !seen.has(id));

  const remaining = await fetchRemainingPosts(topicId, missingIds, baseUrl, options);
  const all = [...firstPage, ...remaining];

  const byPostNumber = new Map<number, DiscoursePost>();
  for (const post of all) {
    if (!byPostNumber.has(post.post_number)) byPostNumber.set(post.post_number, post);
  }
  const posts = [...byPostNumber.values()]
    .sort((a, b) => a.post_number - b.post_number)
    .map((post) => toThreadPost(post, { baseUrl, topicSlug, topicId }));

  return {
    topic: {
      slug: options.topicSlug ?? topicSlug,
      title: topicResponse.title ?? topicSlug,
      pepNumber: options.pepNumber ?? null,
    },
    source: {
      kind: "discourse",
      url: `${baseUrl}/t/${topicSlug}/${topicId}`,
      title: topicResponse.title ?? topicSlug,
      externalId: String(topicId),
    },
    posts,
  };
}
