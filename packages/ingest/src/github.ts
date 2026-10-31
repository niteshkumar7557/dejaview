// GitHub adapter for issues and pull requests.
//
// Everything comes from the public REST API:
//   GET /repos/{o}/{r}/issues/{n}            the issue or PR body
//   GET /repos/{o}/{r}/issues/{n}/comments    issue comments (also on PRs)
//   GET /repos/{o}/{r}/pulls/{n}             PR metadata
//   GET /repos/{o}/{r}/pulls/{n}/files       changed files (used for code links)
//   GET /repos/{o}/{r}/pulls/{n}/comments     review comments
//
// Bodies are Markdown, so posts come out with format "markdown" and the pipeline
// (not the ingest) is responsible for stripping quotes and HTML.

import type { Thread, ThreadPost } from "@dejaview/shared";
import { getJson, type IngestOptions } from "./http.js";
import { parseGithubUrl } from "./url.js";

const API_ROOT = "https://api.github.com";
const PER_PAGE = 100;
/** Safety net so a huge thread cannot loop forever. */
const MAX_PAGES = 20;

interface GithubUser {
  login?: string | null;
}

interface GithubReactions {
  "+1"?: { count?: number } | null;
}

interface GithubIssue {
  number?: number;
  title?: string | null;
  body?: string | null;
  user?: GithubUser | null;
  created_at?: string | null;
  html_url?: string | null;
  reactions?: GithubReactions | null;
}

interface GithubComment {
  id: number;
  body?: string | null;
  user?: GithubUser | null;
  created_at?: string | null;
  html_url?: string | null;
  in_reply_to_id?: number | null;
  reactions?: GithubReactions | null;
}

interface GithubPull {
  number?: number;
  title?: string | null;
  body?: string | null;
  user?: GithubUser | null;
  created_at?: string | null;
  html_url?: string | null;
  changed_files?: number;
}

interface GithubPullFileResponse {
  filename: string;
  previous_filename?: string | null;
  status?: string;
}

export interface GithubOptions extends IngestOptions {
  /** Topic slug in our own naming, e.g. "pep-701". Defaults to "gh-{owner}-{repo}-{number}". */
  topicSlug?: string;
  pepNumber?: number | null;
}

export interface GithubPullFile {
  path: string;
  /** Set when the file was renamed in the PR. */
  previousPath: string | null;
}

function authHeaders(options: IngestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (options.githubToken) {
    headers.Authorization = `Bearer ${options.githubToken}`;
  }
  return headers;
}

/** Walks the paginated list endpoints until a short page comes back. */
async function getAllPages<T>(url: string, options: IngestOptions): Promise<T[]> {
  const headers = authHeaders(options);
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const separator = url.includes("?") ? "&" : "?";
    const pageUrl = `${url}${separator}per_page=${PER_PAGE}&page=${page}`;
    const body = (await getJson(pageUrl, options, { headers })) as T[];
    if (!Array.isArray(body)) return all;
    all.push(...body);
    if (body.length < PER_PAGE) break;
  }
  return all;
}

function reactionCount(reactions: GithubReactions | null | undefined): number | undefined {
  const count = reactions?.["+1"]?.count ?? 0;
  return count > 0 ? count : undefined;
}

function authorOf(user: GithubUser | null | undefined): string {
  return user?.login?.trim() || "unknown";
}

/** Makes sure every post id is unique inside the thread, without touching the platform ids. */
function makeIdsUnique(posts: ThreadPost[]): ThreadPost[] {
  const used = new Set<number>();
  return posts.map((post) => {
    let id = post.id;
    while (used.has(id)) id += 1_000_000_000;
    used.add(id);
    return { ...post, id };
  });
}

function issuePost(issue: GithubIssue, issueNumber: number): ThreadPost {
  return {
    id: issueNumber,
    externalId: String(issueNumber),
    author: authorOf(issue.user),
    createdAt: issue.created_at ?? null,
    url: issue.html_url ?? null,
    body: issue.body ?? "",
    format: "markdown",
    likes: reactionCount(issue.reactions),
    replyToId: null,
  };
}

function commentPost(comment: GithubComment): ThreadPost {
  return {
    id: comment.id,
    externalId: String(comment.id),
    author: authorOf(comment.user),
    createdAt: comment.created_at ?? null,
    url: comment.html_url ?? null,
    body: comment.body ?? "",
    format: "markdown",
    likes: reactionCount(comment.reactions),
    replyToId: comment.in_reply_to_id ?? null,
  };
}

function sortByCreation(posts: ThreadPost[]): ThreadPost[] {
  return [...posts].sort((a, b) => {
    const left = a.createdAt ?? "";
    const right = b.createdAt ?? "";
    if (left === right) return a.id - b.id;
    return left < right ? -1 : 1;
  });
}

/**
 * Fetches a GitHub issue or pull request as a DejaView Thread.
 * The issue/PR body becomes the first post, every comment follows it.
 */
export async function fetchGithubThread(url: string, options: GithubOptions = {}): Promise<Thread> {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    throw new Error(`Not a GitHub issue or pull request URL: ${url}`);
  }
  const { owner, repo, number, isPullRequest } = parsed;
  const repoRoot = `${API_ROOT}/repos/${owner}/${repo}`;
  const headers = authHeaders(options);

  const issue = (await getJson(`${repoRoot}/issues/${number}`, options, { headers })) as GithubIssue;
  const issueNumber = issue.number ?? number;

  const posts: ThreadPost[] = [issuePost(issue, issueNumber)];

  const issueComments = await getAllPages<GithubComment>(
    `${repoRoot}/issues/${number}/comments`,
    options,
  );
  posts.push(...issueComments.map(commentPost));

  if (isPullRequest) {
    const pull = (await getJson(`${repoRoot}/pulls/${number}`, options, { headers })) as GithubPull;
    if (pull.title) issue.title = pull.title;
    const reviewComments = await getAllPages<GithubComment>(
      `${repoRoot}/pulls/${number}/comments`,
      options,
    );
    posts.push(...reviewComments.map(commentPost));
  }

  const title = issue.title ?? `${owner}/${repo}#${issueNumber}`;
  const canonicalUrl = issue.html_url ?? `${repoRoot}/${isPullRequest ? "pull" : "issues"}/${issueNumber}`;

  return {
    topic: {
      slug: options.topicSlug ?? `gh-${owner}-${repo}-${issueNumber}`,
      title,
      pepNumber: options.pepNumber ?? null,
    },
    source: {
      kind: isPullRequest ? "github_pr" : "github_issue",
      url: canonicalUrl,
      title,
      externalId: String(issueNumber),
    },
    posts: makeIdsUnique(sortByCreation(posts)),
  };
}

/**
 * The files a pull request touches. The linker uses this to attach a decision to code
 * when the discussion mentions the PR.
 */
export async function fetchGithubPullFiles(
  url: string,
  options: IngestOptions = {},
): Promise<GithubPullFile[]> {
  const parsed = parseGithubUrl(url);
  if (!parsed) {
    throw new Error(`Not a GitHub pull request URL: ${url}`);
  }
  const repoRoot = `${API_ROOT}/repos/${parsed.owner}/${parsed.repo}`;
  const files = await getAllPages<GithubPullFileResponse>(
    `${repoRoot}/pulls/${parsed.number}/files`,
    options,
  );
  return files.map((file) => ({
    path: file.filename,
    previousPath: file.previous_filename ?? null,
  }));
}
