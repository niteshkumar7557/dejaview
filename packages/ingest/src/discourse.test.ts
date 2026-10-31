import { describe, expect, it } from "vitest";
import { fetchDiscourseThread } from "./discourse.js";
import { fakeFetch, loadTestData } from "./testing.js";

const TOPIC_URL = "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839";

const topicData = loadTestData("discourse-topic.json") as {
  id: number;
  slug: string;
  title: string;
  post_stream: { posts: unknown[]; stream: number[] };
};
const batchData = loadTestData("discourse-posts-batch.json");

function discourseRoutes(overrides: { posts?: unknown[]; stream?: number[] } = {}) {
  return [
    {
      pattern: /\/t\/20839\.json$/,
      body: {
        ...topicData,
        post_stream: {
          posts: overrides.posts ?? topicData.post_stream.posts,
          stream: overrides.stream ?? topicData.post_stream.stream,
        },
      },
    },
    { pattern: /\/t\/20839\/posts\.json/, body: batchData },
  ];
}

describe("fetchDiscourseThread", () => {
  it("reads the topic and the posts that are missing from the first page", async () => {
    const fake = fakeFetch(discourseRoutes());
    const thread = await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });

    expect(thread.source.kind).toBe("discourse");
    expect(thread.source.externalId).toBe("20839");
    expect(thread.source.url).toBe(
      "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839",
    );
    expect(thread.topic.title).toBe(topicData.title);
    expect(thread.posts).toHaveLength(4);
    expect(thread.posts.map((post) => post.id)).toEqual([1, 2, 3, 4]);
  });

  it("asks for the remaining posts by their global post ids, not by post number", async () => {
    const fake = fakeFetch(discourseRoutes());
    await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });

    const batchCall = fake.calls.find((url) => url.includes("/posts.json"));
    expect(batchCall).toBeDefined();
    // 73686 and 73701 are the global ids; the post numbers 3 and 4 would return nothing.
    expect(batchCall).toContain("post_ids[]=73686");
    expect(batchCall).toContain("post_ids[]=73701");
    expect(batchCall).not.toContain("post_ids[]=3");
  });

  it("maps the posts onto the Thread contract", async () => {
    const fake = fakeFetch(discourseRoutes());
    const thread = await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });
    const first = thread.posts[0];

    expect(first).toBeDefined();
    expect(first?.id).toBe(1);
    expect(first?.externalId).toBe("1");
    expect(first?.author).toBe("stroxler");
    expect(first?.format).toBe("html");
    expect(first?.likes).toBe(9);
    expect(first?.replyToId).toBeNull();
    expect(first?.url).toBe(
      "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839/1",
    );
    expect(first?.body).toContain("<p>");
    expect(first?.createdAt).toBeTruthy();
  });

  it("does not count a post twice when the first page already has it", async () => {
    const fake = fakeFetch(discourseRoutes());
    const thread = await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });
    const ids = thread.posts.map((post) => post.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps going when a post in the stream has been deleted", async () => {
    const fake = fakeFetch([
      {
        pattern: /\/t\/20839\.json$/,
        body: {
          ...topicData,
          post_stream: { posts: topicData.post_stream.posts, stream: [73558, 73567, 73686, 999999] },
        },
      },
      // The batch only resolves 73686; 999999 is gone.
      { pattern: /\/t\/20839\/posts\.json/, body: batchData },
    ]);
    const thread = await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });
    expect(thread.posts.map((post) => post.id)).toEqual([1, 2, 3, 4]);
  });

  it("asks for the remaining posts in batches of twenty", async () => {
    const stream = Array.from({ length: 25 }, (_, index) => 1000 + index);
    const fake = fakeFetch([
      { pattern: /\/t\/20839\.json$/, body: { ...topicData, post_stream: { posts: [], stream } } },
      { pattern: /\/t\/20839\/posts\.json/, body: { post_stream: { posts: [] } } },
    ]);
    await fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl });

    const batchCalls = fake.calls.filter((url) => url.includes("/posts.json"));
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls[0]?.match(/post_ids\[\]/g)).toHaveLength(20);
    expect(batchCalls[1]?.match(/post_ids\[\]/g)).toHaveLength(5);
  });

  it("takes the topic slug and PEP number from the caller", async () => {
    const fake = fakeFetch(discourseRoutes());
    const thread = await fetchDiscourseThread(TOPIC_URL, {
      fetchImpl: fake.fetchImpl,
      topicSlug: "pep-698",
      pepNumber: 698,
    });
    expect(thread.topic.slug).toBe("pep-698");
    expect(thread.topic.pepNumber).toBe(698);
  });

  it("fails loudly when the forum answers with an error", async () => {
    const fake = fakeFetch([{ pattern: /.*/, body: {}, status: 500 }]);
    await expect(fetchDiscourseThread(TOPIC_URL, { fetchImpl: fake.fetchImpl })).rejects.toThrow(
      /HTTP 500/,
    );
  });
});
