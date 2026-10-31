import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ExtractedDecision, ThreadPost } from "@dejaview/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { linkDecision } from "../src/index.js";

const execFileAsync = promisify(execFile);
const fixtureDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "github");
let temporaryDirectory: string;
let repositoryPath: string;
let headCommit: string;

async function git(...args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repositoryPath, ...args]);
  return result.stdout.trim();
}

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await (await import("node:fs/promises")).readFile(path.join(fixtureDirectory, name), "utf8")) as unknown;
}

function mockGitHub(responses: Array<{ body: unknown; status?: number; headers?: Record<string, string> }>) {
  const requests: string[] = [];
  const mockFetch: typeof fetch = vi.fn(async (input: RequestInfo | URL) => {
    requests.push(String(input));
    const next = responses.shift();
    if (!next) throw new Error("Unexpected GitHub request");
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: next.headers });
  });
  vi.stubGlobal("fetch", mockFetch);
  return requests;
}

function post(id: number, body: string, replyToId?: number): ThreadPost {
  return { id, externalId: String(id), author: "author", createdAt: null, url: null, body, format: "markdown", replyToId };
}

function decision(postIds: number[]): ExtractedDecision {
  return {
    key: "decision-1",
    title: "Keep the API",
    kind: "proposal",
    status: "accepted",
    summary: "The API stays stable.",
    confidence: "high",
    decidedAt: null,
    model: "test-model",
    reasons: [{
      text: "Evidence backs this choice.",
      evidence: postIds.map((postId) => ({ postId, quote: "reference", verified: true, matchScore: 1 })),
    }],
  };
}

async function context(repoDir = repositoryPath) {
  return { repoDir, repo: "python/cpython" };
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "dejaview-link-decision-"));
  repositoryPath = path.join(temporaryDirectory, "cpython");
  await mkdir(path.join(repositoryPath, "Lib"), { recursive: true });
  await mkdir(path.join(repositoryPath, "Objects"), { recursive: true });
  await execFileAsync("git", ["init", repositoryPath]);
  await git("config", "user.name", "DejaView Test");
  await git("config", "user.email", "test@example.invalid");
  await writeFile(path.join(repositoryPath, "Lib", "typing.py"), [
    "def override(method):",
    "    return method",
    "",
    "def unrelated():",
    "    return None",
  ].join("\n"));
  await writeFile(path.join(repositoryPath, "Objects", "errors.c"), [
    "void PyErr_SetString(void *exception, const char *message)",
    "{",
    "    (void)exception;",
    "    (void)message;",
    "}",
    "",
    "void caller(void) { PyErr_SetString(0, 0); }",
  ].join("\n"));
  await git("add", ".");
  await git("commit", "-m", "create cpython fixture");
  headCommit = await git("rev-parse", "HEAD");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("linkDecision", () => {
  it("resolves PR references to changed files and the merge commit at highest priority", async () => {
    const pageTwoUrl = "https://api.github.com/repos/python/cpython/pulls/123/files?per_page=100&page=2";
    const requests = mockGitHub([
      { body: await fixture("pull-123.json") },
      { body: await fixture("files-page-1.json"), headers: { Link: `<${pageTwoUrl}>; rel="next"` } },
      { body: await fixture("files-page-2.json") },
    ]);
    const references = "See https://github.com/python/cpython/pull/123 and Lib/typing.py";
    const anchors = await linkDecision(decision([10]), [post(10, references)], await context());

    expect(requests).toHaveLength(3);
    expect(anchors).toEqual([
      {
        repo: "python/cpython",
        symbol: null,
        originalPath: "Lib/typing.py",
        originalCommit: "0123456789abcdef0123456789abcdef01234567",
        currentPath: "Lib/typing.py",
        relocatedBy: null,
        linkMethod: "pr_ref",
        evidencePostId: 10,
      },
      {
        repo: "python/cpython",
        symbol: null,
        originalPath: "Lib/_typing_helpers.py",
        originalCommit: "0123456789abcdef0123456789abcdef01234567",
        currentPath: null,
        relocatedBy: null,
        linkMethod: "pr_ref",
        evidencePostId: 10,
      },
      {
        repo: "python/cpython",
        symbol: null,
        originalPath: "Objects/typevarobject.c",
        originalCommit: "0123456789abcdef0123456789abcdef01234567",
        currentPath: null,
        relocatedBy: null,
        linkMethod: "pr_ref",
        evidencePostId: 10,
      },
    ]);
  });

  it("resolves python/cpython# and gh- references through one cached PR lookup", async () => {
    const requests = mockGitHub([
      { body: await fixture("pull-123.json") },
      { body: await fixture("files-page-1.json") },
    ]);
    const anchors = await linkDecision(decision([1]), [post(1, "python/cpython#123 and gh-123")], await context());
    expect(requests).toHaveLength(2);
    expect(anchors.map((anchor) => anchor.linkMethod)).toEqual(["pr_ref", "pr_ref"]);
  });

  it("creates path anchors only for files present at HEAD", async () => {
    const anchors = await linkDecision(decision([1]), [post(1, "See Lib/typing.py and Lib/missing.py")], await context());
    expect(anchors).toEqual([{
      repo: "python/cpython",
      symbol: null,
      originalPath: "Lib/typing.py",
      originalCommit: null,
      currentPath: "Lib/typing.py",
      relocatedBy: null,
      linkMethod: "path_mention",
      evidencePostId: 1,
    }]);
  });

  it("resolves Python and C symbols to definitions", async () => {
    const anchors = await linkDecision(decision([1]), [post(1, "Use `typing.override` and `PyErr_SetString`")], await context());
    expect(anchors).toEqual([
      {
        repo: "python/cpython",
        symbol: "typing.override",
        originalPath: "Lib/typing.py",
        originalCommit: null,
        currentPath: "Lib/typing.py",
        relocatedBy: null,
        linkMethod: "symbol_mention",
        evidencePostId: 1,
      },
      {
        repo: "python/cpython",
        symbol: "PyErr_SetString",
        originalPath: "Objects/errors.c",
        originalCommit: null,
        currentPath: "Objects/errors.c",
        relocatedBy: null,
        linkMethod: "symbol_mention",
        evidencePostId: 1,
      },
    ]);
  });

  it("scans evidence posts and their direct replies, retaining the post that supplied each link", async () => {
    const posts = [
      post(10, "Decision evidence without a link"),
      post(11, "The implementation is in Lib/typing.py", 10),
      post(12, "Unrelated mention of Objects/errors.c"),
      post(13, "A reply to the reply mentions Objects/errors.c", 11),
    ];
    const anchors = await linkDecision(decision([10]), posts, await context());
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.originalPath).toBe("Lib/typing.py");
    expect(anchors[0]?.evidencePostId).toBe(11);
  });

  it("retains provenance across evidence posts but suppresses duplicate anchors within a post", async () => {
    const anchors = await linkDecision(decision([1, 2]), [
      post(1, "Lib/typing.py and Lib/typing.py"),
      post(2, "Lib/typing.py"),
    ], await context());
    expect(anchors).toHaveLength(2);
    expect(anchors.map((anchor) => anchor.evidencePostId)).toEqual([1, 2]);
  });

  it("attaches a referenced commit only when it exists in the local repository", async () => {
    const anchors = await linkDecision(decision([1]), [post(1, `Lib/typing.py at ${headCommit}`)], await context());
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.originalCommit).toBe(headCommit);
  });

  it("handles unmerged PRs with a null original commit", async () => {
    mockGitHub([
      { body: await fixture("pull-unmerged.json") },
      { body: [{ filename: "Lib/typing.py" }] },
    ]);
    const anchors = await linkDecision(decision([1]), [post(1, "https://github.com/python/cpython/pull/124")], await context());
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.originalCommit).toBeNull();
    expect(anchors[0]?.linkMethod).toBe("pr_ref");
  });

  it("retains valid path anchors when GitHub lookup fails", async () => {
    mockGitHub([{ body: await fixture("not-found.json"), status: 404 }]);
    const anchors = await linkDecision(decision([1]), [post(1, "https://github.com/python/cpython/pull/404 and Lib/typing.py")], await context());
    expect(anchors).toHaveLength(1);
    expect(anchors[0]?.linkMethod).toBe("path_mention");
    expect(anchors[0]?.originalPath).toBe("Lib/typing.py");
  });

  it("handles invalid local repositories without fabricating path or symbol anchors", async () => {
    mockGitHub([
      { body: await fixture("pull-123.json") },
      { body: await fixture("files-page-1.json") },
      { body: await fixture("files-page-2.json") },
    ]);
    const anchors = await linkDecision(
      decision([1]),
      [post(1, "https://github.com/python/cpython/pull/123 Lib/typing.py `typing.override`")],
      await context(path.join(temporaryDirectory, "not-a-repository")),
    );
    expect(anchors.every((anchor) => anchor.linkMethod === "pr_ref" && anchor.currentPath === null)).toBe(true);
  });

  it("returns no anchors and makes no GitHub request without evidence posts", async () => {
    const requests = mockGitHub([]);
    await expect(linkDecision(decision([]), [post(1, "Lib/typing.py")], await context())).resolves.toEqual([]);
    expect(requests).toHaveLength(0);
  });

  it("returns no speculative anchors for unresolved symbols or non-PR issue references", async () => {
    mockGitHub([{ body: await fixture("not-found.json"), status: 404 }]);
    const anchors = await linkDecision(decision([1]), [post(1, "`NoSuchSymbol` bpo-12345")], await context());
    expect(anchors).toEqual([]);
  });
});
