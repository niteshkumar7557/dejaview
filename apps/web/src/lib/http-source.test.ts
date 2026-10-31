import { describe, expect, it } from "vitest";
import { ApiRequestError, createHttpSource } from "./http-source";

type Call = { url: string; init?: RequestInit };

function fakeFetch(status: number, body: unknown, calls: Call[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("createHttpSource", () => {
  it("returns the parsed body on 200 and calls the right URL", async () => {
    const calls: Call[] = [];
    const topic = { slug: "pep-701", title: "f-strings" };
    const source = createHttpSource("http://api.test", fakeFetch(200, topic, calls));
    await expect(source.getTopic("pep-701")).resolves.toEqual(topic);
    expect(calls[0]?.url).toBe("http://api.test/api/topics/pep-701");
  });

  it("returns null on 404", async () => {
    const source = createHttpSource("http://api.test", fakeFetch(404, { error: "not found" }, []));
    await expect(source.getDecision(999)).resolves.toBeNull();
  });

  it("throws ApiRequestError with the status on 500", async () => {
    const source = createHttpSource("http://api.test", fakeFetch(500, { error: "boom" }, []));
    const error = await source.listTopics().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(500);
    expect((error as ApiRequestError).message).toBe("boom");
  });

  it("posts ingest requests as JSON", async () => {
    const calls: Call[] = [];
    const source = createHttpSource("http://api.test/", fakeFetch(200, { jobId: 4, topicSlug: "pep-698" }, calls));
    await source.startIngest({ url: "https://discuss.python.org/t/x/1", topicSlug: "pep-698" });
    expect(calls[0]?.url).toBe("http://api.test/api/ingest");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(new Headers(calls[0]?.init?.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      url: "https://discuss.python.org/t/x/1",
      topicSlug: "pep-698",
    });
  });
});

describe("createHttpSource when the API is unreachable", () => {
  it("turns a network failure into ApiRequestError with status 0", async () => {
    const failing = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    const error = await createHttpSource("http://api.test", failing).listTopics().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(0);
  });
  it("gives every request a timeout signal", async () => {
    const calls: Call[] = [];
    await createHttpSource("http://api.test", fakeFetch(200, [], calls)).listTopics();
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });
});
