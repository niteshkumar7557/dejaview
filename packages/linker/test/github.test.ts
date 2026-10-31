import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { lookupPullRequest } from "../src/index.js";

const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "github");

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(fixtureDirectory, name), "utf8")) as unknown;
}

interface MockResponse {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
}

function fetchSequence(responses: MockResponse[]) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected HTTP request");
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: next.headers,
    });
  });
  return { calls, fetchImpl };
}

describe("lookupPullRequest", () => {
  it("retrieves PR metadata and all changed-file pages, including rename information", async () => {
    const pageOneUrl = "https://api.github.com/repos/python/cpython/pulls/123/files?per_page=100&page=1";
    const pageTwoUrl = "https://api.github.com/repos/python/cpython/pulls/123/files?per_page=100&page=2";
    const { calls, fetchImpl } = fetchSequence([
      { body: await fixture("pull-123.json") },
      { body: await fixture("files-page-1.json"), headers: { Link: `<${pageTwoUrl}>; rel="next"` } },
      { body: await fixture("files-page-2.json") },
    ]);

    const result = await lookupPullRequest(123, { token: "test-token", fetchImpl });
    expect(result).toEqual({
      ok: true,
      pullRequest: {
        number: 123,
        title: "Improve typing support",
        state: "closed",
        mergeCommitSha: "0123456789abcdef0123456789abcdef01234567",
        repository: {
          owner: "python",
          name: "cpython",
          fullName: "python/cpython",
          htmlUrl: "https://github.com/python/cpython",
        },
        files: [
          { path: "Lib/typing.py", previousPath: null },
          { path: "Lib/typing_helpers.py", previousPath: "Lib/_typing_helpers.py" },
          { path: "Objects/typevarobject.c", previousPath: null },
        ],
      },
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.github.com/repos/python/cpython/pulls/123",
      pageOneUrl,
      pageTwoUrl,
    ]);
    expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer test-token");
    expect(new Headers(calls[0]?.init?.headers).get("accept")).toBe("application/vnd.github+json");
  });

  it("uses the default repository and optional GITHUB_TOKEN", async () => {
    const { calls, fetchImpl } = fetchSequence([
      { body: await fixture("pull-minimal.json") },
      { body: [] },
    ]);
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "environment-token";
    try {
      const result = await lookupPullRequest(125, { fetchImpl });
      expect(result).toMatchObject({ ok: true, pullRequest: { repository: { fullName: "python/cpython" } } });
      expect(calls[0]?.url).toBe("https://api.github.com/repos/python/cpython/pulls/125");
      expect(new Headers(calls[0]?.init?.headers).get("authorization")).toBe("Bearer environment-token");
    } finally {
      if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previousToken;
    }
  });

  it("handles unmerged PRs and missing optional response fields", async () => {
    const { fetchImpl } = fetchSequence([
      { body: await fixture("pull-unmerged.json") },
      { body: [{ filename: "Lib/new_file.py" }] },
    ]);
    const result = await lookupPullRequest(124, { fetchImpl });
    expect(result).toMatchObject({
      ok: true,
      pullRequest: {
        mergeCommitSha: null,
        files: [{ path: "Lib/new_file.py", previousPath: null }],
      },
    });
  });

  it("returns not_found and does not request the files endpoint for missing PRs", async () => {
    const { calls, fetchImpl } = fetchSequence([{ body: await fixture("not-found.json"), status: 404 }]);
    await expect(lookupPullRequest(404, { fetchImpl })).resolves.toMatchObject({
      ok: false,
      error: { kind: "not_found", status: 404 },
    });
    expect(calls).toHaveLength(1);
  });

  it("handles invalid authentication", async () => {
    const { fetchImpl } = fetchSequence([{ body: await fixture("unauthorized.json"), status: 401 }]);
    await expect(lookupPullRequest(123, { token: "invalid", fetchImpl })).resolves.toMatchObject({
      ok: false,
      error: { kind: "unauthorized", status: 401, message: "Bad credentials" },
    });
  });

  it("distinguishes rate limits from other forbidden responses", async () => {
    const rateLimited = fetchSequence([{
      body: await fixture("rate-limit.json"),
      status: 403,
      headers: { "X-RateLimit-Remaining": "0", "Retry-After": "60" },
    }]);
    await expect(lookupPullRequest(123, { fetchImpl: rateLimited.fetchImpl })).resolves.toMatchObject({
      ok: false,
      error: { kind: "rate_limited", status: 403, retryAfterSeconds: 60 },
    });

    const forbidden = fetchSequence([{ body: await fixture("forbidden.json"), status: 403 }]);
    await expect(lookupPullRequest(123, { fetchImpl: forbidden.fetchImpl })).resolves.toMatchObject({
      ok: false,
      error: { kind: "forbidden", status: 403 },
    });
  });

  it("handles network errors without throwing", async () => {
    const fetchImpl: typeof fetch = vi.fn(async () => {
      throw new TypeError("connection refused");
    });
    await expect(lookupPullRequest(123, { fetchImpl })).resolves.toMatchObject({
      ok: false,
      error: { kind: "network_error", message: "connection refused" },
    });
  });

  it("validates input and repository format before making requests", async () => {
    const { calls, fetchImpl } = fetchSequence([]);
    await expect(lookupPullRequest(0, { fetchImpl })).resolves.toMatchObject({ ok: false, error: { kind: "invalid_response" } });
    await expect(lookupPullRequest(12, { repository: "not-a-repository", fetchImpl })).resolves.toMatchObject({ ok: false, error: { kind: "invalid_response" } });
    expect(calls).toHaveLength(0);
  });
});
