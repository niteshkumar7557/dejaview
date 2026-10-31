import { describe, expect, it } from "vitest";
import { fetchGithubPullFiles, fetchGithubThread } from "./github.js";
import { fakeFetch, loadTestData } from "./testing.js";

const issueData = loadTestData("github-issue.json") as { number: number; user: { login: string } };
const issueCommentsData = loadTestData("github-issue-comments.json") as { id: number }[];
const prData = loadTestData("github-pr.json") as { number: number; body: string | null };
const prFilesData = loadTestData("github-pr-files.json") as { filename: string }[];
const prReviewCommentsData = loadTestData("github-pr-review-comments.json") as { id: number }[];

const ISSUE_URL = "https://github.com/python/cpython/issues/81061";
const PR_URL = "https://github.com/python/cpython/pull/1";

function issueRoutes() {
  return [
    { pattern: /\/issues\/81061$/, body: issueData },
    { pattern: /\/issues\/81061\/comments/, body: issueCommentsData },
  ];
}

function pullRoutes() {
  return [
    { pattern: /\/pulls\/1$/, body: prData },
    { pattern: /\/pulls\/1\/comments/, body: prReviewCommentsData },
    { pattern: /\/pulls\/1\/files/, body: prFilesData },
    { pattern: /\/issues\/1\/comments/, body: [] },
    { pattern: /\/issues\/1$/, body: prData },
  ];
}

describe("fetchGithubThread", () => {
  it("turns an issue and its comments into a thread", async () => {
    const fake = fakeFetch(issueRoutes());
    const thread = await fetchGithubThread(ISSUE_URL, { fetchImpl: fake.fetchImpl });

    expect(thread.source.kind).toBe("github_issue");
    expect(thread.source.externalId).toBe(String(issueData.number));
    expect(thread.source.url).toContain("/issues/81061");
    expect(thread.posts).toHaveLength(1 + issueCommentsData.length);
    expect(thread.posts[0]?.author).toBe(issueData.user.login);
    expect(thread.posts[0]?.format).toBe("markdown");
  });

  it("keeps the GitHub comment ids as post ids", async () => {
    const fake = fakeFetch(issueRoutes());
    const thread = await fetchGithubThread(ISSUE_URL, { fetchImpl: fake.fetchImpl });
    const commentIds = thread.posts.map((post) => post.externalId);
    for (const comment of issueCommentsData) {
      expect(commentIds).toContain(String(comment.id));
    }
  });

  it("puts a pull request, its comments and its review comments in one thread", async () => {
    const fake = fakeFetch(pullRoutes());
    const thread = await fetchGithubThread(PR_URL, { fetchImpl: fake.fetchImpl });

    expect(thread.source.kind).toBe("github_pr");
    expect(thread.posts).toHaveLength(1 + prReviewCommentsData.length);
  });

  it("copes with a pull request that has no description", async () => {
    const fake = fakeFetch(pullRoutes());
    const thread = await fetchGithubThread(PR_URL, { fetchImpl: fake.fetchImpl });
    expect(prData.body).toBeNull();
    expect(thread.posts[0]?.body).toBe("");
  });

  it("gives every post a unique id inside the thread", async () => {
    const fake = fakeFetch(pullRoutes());
    const thread = await fetchGithubThread(PR_URL, { fetchImpl: fake.fetchImpl });
    const ids = thread.posts.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("sorts the posts by creation time", async () => {
    const fake = fakeFetch(pullRoutes());
    const thread = await fetchGithubThread(PR_URL, { fetchImpl: fake.fetchImpl });
    const times = thread.posts.map((post) => post.createdAt ?? "");
    expect([...times].sort()).toEqual(times);
  });

  it("sends the token when one is given", async () => {
    const fake = fakeFetch(issueRoutes());
    await fetchGithubThread(ISSUE_URL, { fetchImpl: fake.fetchImpl, githubToken: "secret-token" });
    const issueCall = fake.headers.find((call) => call.url.includes("/issues/81061"));
    expect(issueCall?.headers.Authorization).toBe("Bearer secret-token");
  });

  it("does not send a token when there is none", async () => {
    const fake = fakeFetch(issueRoutes());
    await fetchGithubThread(ISSUE_URL, { fetchImpl: fake.fetchImpl });
    const issueCall = fake.headers.find((call) => call.url.includes("/issues/81061"));
    expect(issueCall?.headers.Authorization).toBeUndefined();
  });

  it("fails loudly when GitHub answers with an error", async () => {
    const fake = fakeFetch([{ pattern: /.*/, body: {}, status: 403 }]);
    await expect(fetchGithubThread(ISSUE_URL, { fetchImpl: fake.fetchImpl })).rejects.toThrow(
      /HTTP 403/,
    );
  });
});

describe("fetchGithubPullFiles", () => {
  it("maps the changed files and their previous names", async () => {
    const fake = fakeFetch(pullRoutes());
    const files = await fetchGithubPullFiles(PR_URL, { fetchImpl: fake.fetchImpl });
    expect(files.length).toBe(prFilesData.length);
    expect(files[0]?.path).toBe(prFilesData[0]?.filename);
    expect(files[0]?.previousPath).toBeNull();
  });
});
