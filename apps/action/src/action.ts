import type { PrChangedFile, PrCheckRequest } from "@dejaview/shared";
import type { DecisionSummary, PrCheckResponse } from "@dejaview/shared";
import { readFile } from "node:fs/promises";

const GITHUB_API = "https://api.github.com";
const COMMENT_MARKER = "<!-- dejaview -->";
const GITHUB_ACTION_BOT_LOGIN = "github-actions[bot]";
const API_VERSION = "2022-11-28";

interface ActionEvent {
  action?: unknown;
  repository?: { full_name?: unknown; owner?: { login?: unknown }; name?: unknown };
  pull_request?: { number?: unknown };
}

interface PullRequestPayload {
  number?: unknown;
  title?: unknown;
  body?: unknown;
}

interface FilePayload {
  filename?: unknown;
  previous_filename?: unknown;
  patch?: unknown;
}

interface CommentPayload {
  id?: unknown;
  body?: unknown;
  user?: { login?: unknown };
}

export interface ActionRunResult {
  request: PrCheckRequest;
  comment: "created" | "updated";
}

/** Run one PR event: gather files/symbols, call DejaView, and upsert its comment. */
export async function runAction(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionRunResult> {
  const githubToken = requiredSecret(environment.GITHUB_TOKEN, "GITHUB_TOKEN");
  const dejaviewToken = requiredSecret(environment.DEJAVIEW_API_TOKEN, "DEJAVIEW_API_TOKEN");
  const dejaviewUrl = requiredSecret(environment.DEJAVIEW_API_URL, "DEJAVIEW_API_URL").replace(/\/+$/, "");
  const eventPath = requiredSecret(environment.GITHUB_EVENT_PATH, "GITHUB_EVENT_PATH");

  const event = parseEvent(await readEvent(eventPath));
  const repo = repositoryName(event, environment.GITHUB_REPOSITORY);
  const prNumber = pullNumber(event);
  const githubHeaders = createGitHubHeaders(githubToken);

  const pull = await getJson<PullRequestPayload>(fetchImpl, `${GITHUB_API}/repos/${repo}/pulls/${prNumber}`, githubHeaders, "GitHub pull-request lookup failed");
  const title = typeof pull.title === "string" ? pull.title : "";
  const body = typeof pull.body === "string" ? pull.body : "";

  const changedFiles = await getChangedFiles(fetchImpl, repo, prNumber, githubHeaders);
  const request: PrCheckRequest = {
    repo,
    prNumber,
    title,
    body,
    files: changedFiles.map(({ path, previousPath }) => ({ path, previousPath })),
    symbols: extractSymbolsFromPatches(changedFiles.map((file) => file.patch)),
  };

  const apiResponse = await postDejaView(fetchImpl, `${dejaviewUrl}/api/pr-check`, dejaviewToken, request);
  const comments = await getComments(fetchImpl, repo, prNumber, githubHeaders);
  const existing = comments.find((comment) => comment.authorLogin === GITHUB_ACTION_BOT_LOGIN && comment.body.includes(COMMENT_MARKER));
  const commentBody = apiResponse.commentMarkdown;

  if (existing) {
    await sendJson(fetchImpl, `${GITHUB_API}/repos/${repo}/issues/comments/${existing.id}`, githubHeaders, "PATCH", { body: commentBody }, "GitHub comment update failed");
    return { request, comment: "updated" };
  }

  await sendJson(fetchImpl, `${GITHUB_API}/repos/${repo}/issues/${prNumber}/comments`, githubHeaders, "POST", { body: commentBody }, "GitHub comment creation failed");
  return { request, comment: "created" };
}

/** Extract only syntactic function/class definitions present in unified diff content. */
export function extractSymbolsFromPatches(patches: Array<string | null>): string[] {
  const pythonSymbols = new Set<string>();
  const cSourceLines: string[] = [];

  for (const patch of patches) {
    if (typeof patch !== "string") continue;
    for (const line of patch.split("\n")) {
      let sourceLine: string | null = null;
      if (line.startsWith("@@")) {
        const context = line.match(/^@@.*?@@\s*(.*)$/)?.[1];
        if (context) sourceLine = context;
      } else if (!line.startsWith("+++") && !line.startsWith("---") && /^[+\- ]/.test(line)) {
        sourceLine = line.slice(1);
      }
      if (sourceLine === null) continue;

      const pythonFunction = /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/.exec(sourceLine);
      const pythonClass = /^\s*class\s+([A-Za-z_]\w*)\b/.exec(sourceLine);
      if (pythonFunction?.[1]) pythonSymbols.add(pythonFunction[1]);
      if (pythonClass?.[1]) pythonSymbols.add(pythonClass[1]);
      cSourceLines.push(sourceLine);
    }
  }

  for (const symbol of findCFunctionDefinitions(cSourceLines.join("\n"))) pythonSymbols.add(symbol);
  return [...pythonSymbols];
}

function findCFunctionDefinitions(source: string): string[] {
  const definitions = new Set<string>();
  const callPattern = /\b([A-Za-z_]\w*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = callPattern.exec(source)) !== null) {
    const name = match[1]!;
    const nameStart = match.index;
    const prefixStart = Math.max(source.lastIndexOf(";", nameStart), source.lastIndexOf("{", nameStart), source.lastIndexOf("}", nameStart)) + 1;
    const prefix = source.slice(prefixStart, nameStart).trim();
    if (!looksLikeCTypePrefix(prefix)) continue;

    const openParen = source.indexOf("(", nameStart + match[0].indexOf("("));
    const closeParen = matchingParen(source, openParen);
    if (closeParen < 0) continue;
    const afterSignature = source.slice(closeParen + 1).match(/^\s*/)?.[0].length ?? 0;
    if (source[closeParen + 1 + afterSignature] === "{") definitions.add(name);
  }

  return [...definitions];
}

function looksLikeCTypePrefix(prefix: string): boolean {
  if (!prefix || /(?:^|\s)(?:if|while|switch|for|return|sizeof|case|throw)\s*\(?\s*$/.test(prefix)) return false;
  if (/[=.]\s*$|->\s*$|\(\s*$/.test(prefix)) return false;
  return /(?:[A-Za-z_]\w*|\*)\s*$/.test(prefix);
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")" && --depth === 0) return index;
  }
  return -1;
}

async function getChangedFiles(
  fetchImpl: typeof fetch,
  repo: string,
  prNumber: number,
  headers: Headers,
): Promise<Array<PrChangedFile & { patch: string | null }>> {
  const endpoint = `${GITHUB_API}/repos/${repo}/pulls/${prNumber}/files`;
  let nextUrl: string | null = `${endpoint}?per_page=100&page=1`;
  const files: Array<PrChangedFile & { patch: string | null }> = [];
  const seen = new Set<string>();

  while (nextUrl) {
    if (seen.has(nextUrl)) throw new Error("GitHub file pagination repeated a page");
    seen.add(nextUrl);
    const response = await request(fetchImpl, nextUrl, { method: "GET", headers }, "GitHub changed-file lookup failed");
    const payload = await parseJson(response, "GitHub returned invalid changed-file JSON");
    if (!Array.isArray(payload)) throw new Error("GitHub changed-file response was not an array");

    for (const raw of payload) {
      if (!isRecord(raw) || typeof raw.filename !== "string" || raw.filename.length === 0) {
        throw new Error("GitHub changed-file response contained an invalid filename");
      }
      files.push({
        path: raw.filename,
        previousPath: typeof raw.previous_filename === "string" ? raw.previous_filename : null,
        patch: typeof raw.patch === "string" ? raw.patch : null,
      });
    }

    nextUrl = nextPage(response.headers.get("link"), nextUrl, endpoint);
  }

  return files;
}

async function getComments(fetchImpl: typeof fetch, repo: string, prNumber: number, headers: Headers): Promise<Array<{ id: number; body: string; authorLogin: string }>> {
  const endpoint = `${GITHUB_API}/repos/${repo}/issues/${prNumber}/comments`;
  let nextUrl: string | null = `${endpoint}?per_page=100&page=1`;
  const comments: Array<{ id: number; body: string; authorLogin: string }> = [];
  const seen = new Set<string>();

  while (nextUrl) {
    if (seen.has(nextUrl)) throw new Error("GitHub comment pagination repeated a page");
    seen.add(nextUrl);
    const response = await request(fetchImpl, nextUrl, { method: "GET", headers }, "GitHub comment lookup failed");
    const payload = await parseJson(response, "GitHub returned invalid comment JSON");
    if (!Array.isArray(payload)) throw new Error("GitHub comment response was not an array");
    for (const value of payload) {
      if (!isRecord(value)) continue;
      const raw = value as CommentPayload;
      if (typeof raw.id === "number" && Number.isSafeInteger(raw.id) && typeof raw.body === "string" && typeof raw.user?.login === "string") {
        comments.push({ id: raw.id, body: raw.body, authorLogin: raw.user.login });
      }
    }
    nextUrl = nextPage(response.headers.get("link"), nextUrl, endpoint);
  }

  return comments;
}

async function postDejaView(fetchImpl: typeof fetch, url: string, token: string, body: PrCheckRequest): Promise<PrCheckResponse> {
  const response = await request(fetchImpl, url, {
    method: "POST",
    headers: new Headers({ Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" }),
    body: JSON.stringify(body),
  }, "DejaView API request failed");
  const payload = await parseJson(response, "DejaView API returned invalid JSON");
  if (!isPrCheckResponse(payload)) throw new Error("DejaView API response did not match PrCheckResponse");
  return payload;
}

async function sendJson(
  fetchImpl: typeof fetch,
  url: string,
  headers: Headers,
  method: "POST" | "PATCH",
  body: unknown,
  errorPrefix: string,
): Promise<void> {
  const jsonHeaders = new Headers(headers);
  jsonHeaders.set("Content-Type", "application/json");
  const response = await request(fetchImpl, url, { method, headers: jsonHeaders, body: JSON.stringify(body) }, errorPrefix);
  // Consume the response body to avoid leaving an unread stream.
  await response.body?.cancel();
}

async function getJson<T>(fetchImpl: typeof fetch, url: string, headers: Headers, errorPrefix: string): Promise<T> {
  const response = await request(fetchImpl, url, { method: "GET", headers }, errorPrefix);
  return await parseJson(response, `${errorPrefix}: invalid JSON`) as T;
}

async function request(fetchImpl: typeof fetch, url: string, init: RequestInit, errorPrefix: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new Error(`${errorPrefix}: connection failed`);
  }
  if (!response.ok) throw new Error(`${errorPrefix}: HTTP ${response.status}`);
  return response;
}

async function parseJson(response: Response, message: string): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    throw new Error(message);
  }
}

function isPrCheckResponse(value: unknown): value is PrCheckResponse {
  if (!isRecord(value) || !Array.isArray(value.decisions) || !Array.isArray(value.similarRejected) || typeof value.commentMarkdown !== "string") return false;
  if (value.commentMarkdown.match(/<!-- dejaview -->/g)?.length !== 1) return false;
  return value.decisions.every(isDecisionSummary) && value.similarRejected.every(isDecisionSummary);
}

function isDecisionSummary(value: unknown): value is DecisionSummary {
  if (!isRecord(value) || typeof value.id !== "number" || !Number.isSafeInteger(value.id) || !isRecord(value.topic) || typeof value.title !== "string") return false;
  if (!(["accepted", "rejected", "withdrawn", "open"] as unknown[]).includes(value.status)) return false;
  if (!(["high", "medium", "low"] as unknown[]).includes(value.confidence)) return false;
  if (!Array.isArray(value.reasons) || !value.reasons.every((reason) => typeof reason === "string") || !Array.isArray(value.anchors)) return false;
  if (typeof value.topic.slug !== "string" || typeof value.topic.title !== "string") return false;
  if (value.topic.pepNumber !== null && typeof value.topic.pepNumber !== "number") return false;
  if (typeof value.verifiedEvidence !== "number" || typeof value.totalEvidence !== "number") return false;
  return value.anchors.every(isCodeAnchor);
}

function isCodeAnchor(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.repo === "string"
    && (typeof value.symbol === "string" || value.symbol === null)
    && typeof value.originalPath === "string"
    && (typeof value.originalCommit === "string" || value.originalCommit === null)
    && (typeof value.currentPath === "string" || value.currentPath === null)
    && (["git-follow", "symbol-search", null] as unknown[]).includes(value.relocatedBy)
    && (["pr_ref", "path_mention", "symbol_mention"] as unknown[]).includes(value.linkMethod)
    && (typeof value.evidencePostId === "number" || value.evidencePostId === null);
}

function parseEvent(value: unknown): ActionEvent {
  if (!isRecord(value) || !isRecord(value.pull_request)) throw new Error("GitHub event does not contain a pull request");
  return value as ActionEvent;
}

function repositoryName(event: ActionEvent, environmentValue: string | undefined): string {
  const eventName = event.repository?.full_name;
  const name = typeof eventName === "string" ? eventName : environmentValue;
  if (!name || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name)) throw new Error("GitHub repository is missing or invalid");
  return name;
}

function pullNumber(event: ActionEvent): number {
  const number = event.pull_request?.number;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1) throw new Error("GitHub event has an invalid pull request number");
  return number;
}

async function readEvent(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    throw new Error("Unable to read GitHub event payload");
  }
}

function createGitHubHeaders(token: string): Headers {
  return new Headers({
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": API_VERSION,
  });
}

function nextPage(link: string | null, currentUrl: string, expectedEndpoint: string): string | null {
  if (!link) return null;
  for (const entry of link.split(",")) {
    const match = /^\s*<([^>]+)>\s*;\s*rel="?([^";]+)"?\s*$/.exec(entry);
    if (!match?.[2]?.split(/\s+/).includes("next")) continue;
    const next = new URL(match[1]!, currentUrl);
    if (next.origin !== GITHUB_API || next.pathname !== new URL(expectedEndpoint).pathname) {
      throw new Error("GitHub pagination link escaped the expected endpoint");
    }
    return next.toString();
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredSecret(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`Missing required secret or environment value: ${name}`);
  return value.trim();
}
