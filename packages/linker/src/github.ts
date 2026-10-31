import type { PrChangedFile } from "@dejaview/shared";

const API_BASE = "https://api.github.com";
const API_VERSION = "2022-11-28";
const DEFAULT_REPOSITORY = "python/cpython";
const FILES_PER_PAGE = 100;

export type GitHubPullRequestState = "open" | "closed";

export interface GitHubRepositoryInfo {
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
}

export interface GitHubPullRequestInfo {
  number: number;
  title: string;
  state: GitHubPullRequestState;
  mergeCommitSha: string | null;
  files: PrChangedFile[];
  repository: GitHubRepositoryInfo;
}

export type GitHubLookupErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "api_error"
  | "network_error"
  | "invalid_response";

export interface GitHubLookupError {
  kind: GitHubLookupErrorKind;
  message: string;
  status?: number;
  retryAfterSeconds?: number;
}

export type GitHubLookupResult =
  | { ok: true; pullRequest: GitHubPullRequestInfo }
  | { ok: false; error: GitHubLookupError };

export interface GitHubLookupOptions {
  /** Owner/repository. Defaults to python/cpython. */
  repository?: string;
  /** Defaults to GITHUB_TOKEN when present. */
  token?: string;
  /** Fetch implementation override for tests and embedding applications. */
  fetchImpl?: typeof fetch;
}

interface ApiRepository {
  full_name?: unknown;
  html_url?: unknown;
  owner?: { login?: unknown };
  name?: unknown;
}

interface PullRequestPayload {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  merge_commit_sha?: unknown;
  base?: { repo?: ApiRepository };
}

interface ChangedFilePayload {
  filename?: unknown;
  previous_filename?: unknown;
}

/** Fetch one GitHub PR and all changed-file pages, including rename source paths. */
export async function lookupPullRequest(
  pullNumber: number,
  options: GitHubLookupOptions = {},
): Promise<GitHubLookupResult> {
  if (!Number.isSafeInteger(pullNumber) || pullNumber < 1) {
    return { ok: false, error: { kind: "invalid_response", message: "Pull request number must be a positive safe integer" } };
  }

  const repository = parseRepository(options.repository ?? DEFAULT_REPOSITORY);
  if (!repository) {
    return { ok: false, error: { kind: "invalid_response", message: "Repository must use owner/repository format" } };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = createHeaders(options.token ?? process.env.GITHUB_TOKEN);
  const pullUrl = `${API_BASE}/repos/${repository.owner}/${repository.name}/pulls/${pullNumber}`;
  const pullResponse = await request(fetchImpl, pullUrl, headers);
  if (!pullResponse.ok) return pullResponse;

  const metadata = parsePullRequest(pullResponse.value, pullNumber, repository);
  if (!metadata.ok) return metadata;

  const filesUrl = `${API_BASE}/repos/${repository.owner}/${repository.name}/pulls/${pullNumber}/files?per_page=${FILES_PER_PAGE}&page=1`;
  const filesResult = await fetchChangedFiles(fetchImpl, filesUrl, headers);
  if (!filesResult.ok) return filesResult;

  return {
    ok: true,
    pullRequest: { ...metadata.value, files: filesResult.value },
  };
}

type RequestResult = { ok: true; value: unknown; response: Response } | { ok: false; error: GitHubLookupError };

async function request(fetchImpl: typeof fetch, url: string, headers: Headers): Promise<RequestResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET", headers });
  } catch (error) {
    return { ok: false, error: { kind: "network_error", message: errorMessage(error) } };
  }

  if (!response.ok) return { ok: false, error: await responseError(response) };

  try {
    return { ok: true, value: await response.json(), response };
  } catch {
    return { ok: false, error: { kind: "invalid_response", message: "GitHub returned invalid JSON", status: response.status } };
  }
}

async function fetchChangedFiles(
  fetchImpl: typeof fetch,
  initialUrl: string,
  headers: Headers,
): Promise<{ ok: true; value: PrChangedFile[] } | { ok: false; error: GitHubLookupError }> {
  const files: PrChangedFile[] = [];
  const expected = new URL(initialUrl);
  let nextUrl: string | null = initialUrl;
  const seenPages = new Set<string>();

  while (nextUrl) {
    if (seenPages.has(nextUrl)) {
      return { ok: false, error: { kind: "invalid_response", message: "GitHub pagination returned a repeated page URL" } };
    }
    seenPages.add(nextUrl);

    const page = await request(fetchImpl, nextUrl, headers);
    if (!page.ok) return page;
    if (!Array.isArray(page.value)) {
      return { ok: false, error: { kind: "invalid_response", message: "GitHub changed-files response must be an array", status: page.response.status } };
    }

    for (const item of page.value as unknown[]) {
      const file = parseChangedFile(item);
      if (!file) {
        return { ok: false, error: { kind: "invalid_response", message: "GitHub returned a changed file without a filename", status: page.response.status } };
      }
      files.push(file);
    }

    const next = parseNextLink(page.response.headers.get("link"));
    if (!next) {
      nextUrl = null;
      continue;
    }

    const resolved = new URL(next, nextUrl);
    if (resolved.origin !== expected.origin || resolved.pathname !== expected.pathname) {
      return { ok: false, error: { kind: "invalid_response", message: "GitHub pagination link points outside the changed-files endpoint" } };
    }
    nextUrl = resolved.toString();
  }

  return { ok: true, value: files };
}

function parsePullRequest(
  value: unknown,
  requestedNumber: number,
  requestedRepository: { owner: string; name: string },
): { ok: true; value: Omit<GitHubPullRequestInfo, "files"> } | { ok: false; error: GitHubLookupError } {
  if (!isRecord(value)) {
    return { ok: false, error: { kind: "invalid_response", message: "GitHub pull-request response must be an object" } };
  }
  if (typeof value.number !== "number" || value.number !== requestedNumber || typeof value.title !== "string") {
    return { ok: false, error: { kind: "invalid_response", message: "GitHub pull-request response is missing its number or title" } };
  }
  if (value.state !== "open" && value.state !== "closed") {
    return { ok: false, error: { kind: "invalid_response", message: "GitHub pull-request response has an invalid state" } };
  }

  const payload = value as PullRequestPayload;
  const apiRepo = payload.base?.repo;
  const owner = nonEmptyString(apiRepo?.owner?.login) ?? requestedRepository.owner;
  const name = nonEmptyString(apiRepo?.name) ?? requestedRepository.name;
  const fullName = nonEmptyString(apiRepo?.full_name) ?? `${owner}/${name}`;
  const mergeCommitSha = typeof payload.merge_commit_sha === "string" ? payload.merge_commit_sha : null;

  return {
    ok: true,
    value: {
      number: requestedNumber,
      title: value.title,
      state: value.state,
      mergeCommitSha,
      repository: {
        owner,
        name,
        fullName,
        htmlUrl: nonEmptyString(apiRepo?.html_url) ?? `https://github.com/${fullName}`,
      },
    },
  };
}

function parseChangedFile(value: unknown): PrChangedFile | null {
  if (!isRecord(value) || typeof value.filename !== "string" || value.filename.length === 0) return null;
  return {
    path: value.filename,
    previousPath: typeof value.previous_filename === "string" ? value.previous_filename : null,
  };
}

async function responseError(response: Response): Promise<GitHubLookupError> {
  let message = `GitHub API returned HTTP ${response.status}`;
  let payload: unknown;
  try {
    payload = await response.json();
    if (isRecord(payload) && typeof payload.message === "string") message = payload.message;
  } catch {
    // Keep the status-based message when the error body is empty or not JSON.
  }

  const retryAfterSeconds = parseRetryAfter(response.headers.get("retry-after"));
  const remaining = response.headers.get("x-ratelimit-remaining");
  const rateLimited = response.status === 429 || (response.status === 403 && (remaining === "0" || /rate limit/i.test(message)));
  if (rateLimited) {
    return { kind: "rate_limited", message, status: response.status, ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }) };
  }
  if (response.status === 404) return { kind: "not_found", message, status: 404 };
  if (response.status === 401) return { kind: "unauthorized", message, status: 401 };
  if (response.status === 403) return { kind: "forbidden", message, status: 403 };
  return { kind: "api_error", message, status: response.status };
}

function parseNextLink(header: string | null): string | null {
  if (!header) return null;
  for (const entry of header.split(",")) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="?([^";]+)"?\s*$/.exec(entry);
    if (match?.[2]?.split(/\s+/).includes("next")) return match[1] ?? null;
  }
  return null;
}

function parseRepository(value: string): { owner: string; name: string } | null {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(value);
  return match ? { owner: match[1]!, name: match[2]! } : null;
}

function createHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  });
  if (token?.trim()) headers.set("Authorization", `Bearer ${token.trim()}`);
  return headers;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
