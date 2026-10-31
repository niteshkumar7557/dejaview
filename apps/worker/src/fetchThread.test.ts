import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchThreadForJob } from "./handlers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetching the thread of an ingest job", () => {
  it("sends the worker's GitHub token, so ingest is not stuck on the anonymous 60-an-hour limit", async () => {
    const headers: Array<string | null> = [];
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      headers.push(new Headers(init?.headers).get("authorization"));
      return new Response("{}", { status: 503 });
    }));

    await expect(
      fetchThreadForJob({ url: "https://github.com/python/cpython/issues/101016", topicSlug: "gh-101016" }, "secret-token"),
    ).rejects.toThrow();
    expect(headers[0]).toBe("Bearer secret-token");
  });
});
