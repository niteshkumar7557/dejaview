import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PrCheckResponse } from "@dejaview/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractSymbolsFromPatches, runAction } from "../src/action.js";

const temporaryDirectories: string[] = [];

interface FetchReply {
  body: unknown;
  raw?: string;
  status?: number;
  headers?: Record<string, string>;
}

function response(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function validApiResponse(): PrCheckResponse {
  return { decisions: [], similarRejected: [], commentMarkdown: "<!-- dejaview -->\nDejaView history" };
}

async function eventFile(action: string, description: string | null = "PR body") {
  const directory = await mkdtemp(path.join(os.tmpdir(), "dejaview-action-test-"));
  temporaryDirectories.push(directory);
  const filePath = path.join(directory, "event.json");
  await writeFile(filePath, JSON.stringify({
    action,
    repository: { full_name: "python/cpython", owner: { login: "python" }, name: "cpython" },
    pull_request: { number: 12, title: "event title", body: description },
  }));
  return filePath;
}

function environment(eventPath: string): NodeJS.ProcessEnv {
  return {
    GITHUB_EVENT_PATH: eventPath,
    GITHUB_REPOSITORY: "python/cpython",
    GITHUB_TOKEN: "github-test-token",
    DEJAVIEW_API_URL: "https://dejaview.example/",
    DEJAVIEW_API_TOKEN: "dejaview-test-token",
  };
}

function actionFetch(options: {
  files?: FetchReply[];
  comments?: FetchReply[];
  api?: FetchReply;
  pull?: FetchReply;
  failApiConnection?: boolean;
} = {}) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fileResponses = [...(options.files ?? [{ body: [] }])];
  const commentResponses = [...(options.comments ?? [{ body: [] }])];
  const mockFetch: typeof fetch = vi.fn(async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/pulls/12")) return response(options.pull?.body ?? { number: 12, title: "API title", body: "API body" }, options.pull?.status ?? 200);
    if (url.includes("/pulls/12/files")) {
      const next = fileResponses.shift();
      if (!next) throw new Error("Unexpected files page");
      return response(next.body, next.status ?? 200, next.headers);
    }
    if (new URL(url).pathname.endsWith("/issues/12/comments") && init?.method !== "POST") {
      const next = commentResponses.shift();
      if (!next) throw new Error("Unexpected comments page");
      return response(next.body, next.status ?? 200, next.headers);
    }
    if (url === "https://dejaview.example/api/pr-check") {
      if (options.failApiConnection) throw new TypeError("connection failed");
      if (options.api?.raw !== undefined) return new Response(options.api.raw, { status: options.api.status ?? 200 });
      return response(options.api?.body ?? validApiResponse(), options.api?.status ?? 200);
    }
    if (url.includes("/issues/comments/")) return response({ id: 999, body: "updated" });
    if (url.endsWith("/issues/12/comments") && init?.method === "POST") return response({ id: 998, body: "created" });
    throw new Error(`Unexpected URL ${url}`);
  });
  return { calls, fetchImpl: mockFetch };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("GitHub Action script", () => {
  it.each(["opened", "synchronize", "reopened"]) ("processes the %s pull-request event", async (action) => {
    const path = await eventFile(action);
    const { calls, fetchImpl } = actionFetch();
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("created");
    expect(result.request).toMatchObject({ repo: "python/cpython", prNumber: 12, title: "API title", body: "API body" });
    expect(calls.map((call) => call.url)).toContain("https://dejaview.example/api/pr-check");
  });

  it("collects multiple changed files, rename provenance and files across pages", async () => {
    const path = await eventFile("synchronize");
    const secondPage = "https://api.github.com/repos/python/cpython/pulls/12/files?per_page=100&page=2";
    const { calls, fetchImpl } = actionFetch({ files: [
      { body: [{ filename: "Lib/new.py", previous_filename: "Lib/old.py", patch: "@@ -1 +1 @@ def changed():\n+class NewClass:\n" }], headers: { Link: `<${secondPage}>; rel="next"` } },
      { body: [{ filename: "Objects/type.c", patch: "@@ -1 +1 @@\n+int PyMakeThing(int x)\n+{\n+ return x;\n+}" }] },
    ] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.request.files).toEqual([
      { path: "Lib/new.py", previousPath: "Lib/old.py" },
      { path: "Objects/type.c", previousPath: null },
    ]);
    expect(result.request.symbols).toEqual(["changed", "NewClass", "PyMakeThing"]);
    expect(calls.some((call) => call.url === secondPage)).toBe(true);
  });

  it("extracts Python functions/classes and reliable C definitions but ignores calls", () => {
    const symbols = extractSymbolsFromPatches([
      [
        "@@ -1 +1 @@ async def async_target(value):",
        "+def added_function(value):",
        "+class AddedClass(Base):",
        "+    added_function(value)",
        "@@ -5 +5 @@",
        "+static PyObject *",
        "+PyMakeObject(int value)",
        "+{",
        "+    PyMakeObject(value);",
        "+}",
        "+    return PyCallOnly();",
      ].join("\n"),
    ]);
    expect(symbols).toEqual(["async_target", "added_function", "AddedClass", "PyMakeObject"]);
  });

  it("uses an empty description when GitHub returns a null PR body", async () => {
    const path = await eventFile("opened", null);
    const { fetchImpl } = actionFetch({ pull: { body: { number: 12, title: "No description", body: null } } });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.request.body).toBe("");
  });

  it("sends exact request data and bearer authentication to DejaView", async () => {
    const path = await eventFile("opened");
    const { calls, fetchImpl } = actionFetch({ files: [{ body: [{ filename: "Lib/typing.py", patch: "+def override(method):" }] }] });
    await runAction(environment(path), fetchImpl);
    const apiCall = calls.find((call) => call.url === "https://dejaview.example/api/pr-check");
    expect(new Headers(apiCall?.init?.headers).get("authorization")).toBe("Bearer dejaview-test-token");
    expect(JSON.parse(String(apiCall?.init?.body))).toEqual({
      repo: "python/cpython",
      prNumber: 12,
      title: "API title",
      body: "API body",
      files: [{ path: "Lib/typing.py", previousPath: null }],
      symbols: ["override"],
    });
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer github-test-token");
  });

  it("handles DejaView HTTP errors without exposing tokens", async () => {
    const path = await eventFile("opened");
    const { fetchImpl } = actionFetch({ api: { body: { error: "unauthorized" }, status: 401 } });
    await expect(runAction(environment(path), fetchImpl)).rejects.toThrow("DejaView API request failed: HTTP 401");
  });

  it("handles DejaView connection failures without exposing credentials", async () => {
    const path = await eventFile("opened");
    const { fetchImpl } = actionFetch({ failApiConnection: true });
    await expect(runAction(environment(path), fetchImpl)).rejects.toThrow("DejaView API request failed: connection failed");
  });

  it("rejects malformed DejaView JSON and invalid response structures", async () => {
    const path = await eventFile("opened");
    const invalidResponse = { decisions: [], similarRejected: [], commentMarkdown: "missing marker" };
    const { fetchImpl } = actionFetch({ api: { body: invalidResponse } });
    await expect(runAction(environment(path), fetchImpl)).rejects.toThrow("PrCheckResponse");
  });

  it("handles invalid DejaView JSON", async () => {
    const path = await eventFile("opened");
    const { fetchImpl } = actionFetch({ api: { body: null, raw: "not-json" } });
    await expect(runAction(environment(path), fetchImpl)).rejects.toThrow("DejaView API returned invalid JSON");
  });

  it("creates a new issue comment with the exact API Markdown", async () => {
    const path = await eventFile("opened");
    const api = validApiResponse();
    const { calls, fetchImpl } = actionFetch({ api: { body: api }, comments: [{ body: [] }] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("created");
    const create = calls.find((call) => call.url.endsWith("/issues/12/comments") && call.init?.method === "POST");
    expect(JSON.parse(String(create?.init?.body))).toEqual({ body: api.commentMarkdown });
  });

  it("updates an existing DejaView comment instead of creating another", async () => {
    const path = await eventFile("synchronize");
    const { calls, fetchImpl } = actionFetch({ comments: [{ body: [{ id: 77, body: "previous\n<!-- dejaview -->", user: { login: "github-actions[bot]" } }] }] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("updated");
    expect(calls.some((call) => call.url.endsWith("/issues/comments/77") && call.init?.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/issues/12/comments") && call.init?.method === "POST")).toBe(false);
  });

  it("finds a marker on a later comments page and never creates duplicates", async () => {
    const path = await eventFile("reopened");
    const secondPage = "https://api.github.com/repos/python/cpython/issues/12/comments?per_page=100&page=2";
    const { calls, fetchImpl } = actionFetch({ comments: [
      { body: [], headers: { Link: `<${secondPage}>; rel="next"` } },
      { body: [
        { id: 78, body: "<!-- dejaview --> old", user: { login: "github-actions[bot]" } },
        { id: 79, body: "<!-- dejaview --> duplicate", user: { login: "github-actions[bot]" } },
      ] },
    ] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("updated");
    expect(calls.some((call) => call.url.endsWith("/issues/comments/78") && call.init?.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/issues/comments/79") && call.init?.method === "PATCH")).toBe(false);
    expect(calls.filter((call) => call.init?.method === "POST" && call.url.includes("/issues/12/comments"))).toHaveLength(0);
  });

  it("does not overwrite another user's comment even when it contains the marker", async () => {
    const path = await eventFile("opened");
    const { calls, fetchImpl } = actionFetch({ comments: [{ body: [
      { id: 44, body: "<!-- dejaview --> user's note", user: { login: "contributor" } },
    ] }] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("created");
    expect(calls.some((call) => call.url.endsWith("/issues/comments/44") && call.init?.method === "PATCH")).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/issues/12/comments") && call.init?.method === "POST")).toBe(true);
  });

  it("prefers a bot-authored marker comment when user comments also contain the marker", async () => {
    const path = await eventFile("synchronize");
    const { calls, fetchImpl } = actionFetch({ comments: [{ body: [
      { id: 43, body: "<!-- dejaview --> user marker", user: { login: "contributor" } },
      { id: 45, body: "<!-- dejaview --> bot comment", user: { login: "github-actions[bot]" } },
    ] }] });
    const result = await runAction(environment(path), fetchImpl);
    expect(result.comment).toBe("updated");
    expect(calls.some((call) => call.url.endsWith("/issues/comments/45") && call.init?.method === "PATCH")).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/issues/comments/43") && call.init?.method === "PATCH")).toBe(false);
    expect(calls.some((call) => call.url.endsWith("/issues/12/comments") && call.init?.method === "POST")).toBe(false);
  });

  it("configures per-PR concurrency without cancelling an active comment update and excludes fork PRs", async () => {
    const workflow = await readFile(new URL("../workflows/dejaview.yml", import.meta.url), "utf8");
    expect(workflow).toContain("group: dejaview-${{ github.repository }}-${{ github.event.pull_request.number }}");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("if: github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow.match(/persist-credentials: false/g)).toHaveLength(2);
    expect(workflow).toContain("pull_request:");
    expect(workflow).not.toContain("pull_request_target");
  });

  it("fails clearly when required secrets or event data are missing", async () => {
    const { fetchImpl, calls } = actionFetch();
    await expect(runAction({}, fetchImpl)).rejects.toThrow("GITHUB_TOKEN");
    expect(calls).toHaveLength(0);
  });

  it.each(["DEJAVIEW_API_TOKEN", "DEJAVIEW_API_URL", "GITHUB_EVENT_PATH"])("requires %s", async (secret) => {
    const path = await eventFile("opened");
    const env = environment(path);
    delete env[secret];
    const { fetchImpl, calls } = actionFetch();
    await expect(runAction(env, fetchImpl)).rejects.toThrow(secret);
    expect(calls).toHaveLength(0);
  });

  it("handles GitHub API failures", async () => {
    const path = await eventFile("opened");
    const { fetchImpl } = actionFetch({ pull: { body: {}, status: 403 } });
    await expect(runAction(environment(path), fetchImpl)).rejects.toThrow("GitHub pull-request lookup failed: HTTP 403");
  });
});
