// Real tests for the API, against a real Postgres, using supertest.
//
// They skip when DATABASE_URL is not set. The CI has a Postgres service and runs the migrations
// before `npm test`, so they run there.

import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { ExtractionResult, Thread } from "@dejaview/shared";
import {
  createPool,
  createTestDatabase,
  TopicsRepository,
  DecisionsRepository,
  IdentityRepository,
  type TestDatabase,
} from "@dejaview/db";
import { createApp } from "./app.js";
import { createContext } from "./context.js";
import { simplePrMatcher } from "./simpleMatcher.js";

const databaseUrl = process.env.DATABASE_URL;
const API_TOKEN = "test-token";
const SLUG = "api-test-topic";

const sampleThread: Thread = {
  topic: { slug: SLUG, title: "API test topic", pepNumber: 999 },
  source: {
    kind: "discourse",
    url: "https://discuss.python.org/t/api-test-topic/1",
    title: "API test topic",
    externalId: "1",
  },
  posts: [
    {
      id: 1,
      externalId: "1",
      author: "alice",
      createdAt: "2024-01-01T00:00:00.000Z",
      url: "https://discuss.python.org/t/api-test-topic/1/1",
      body: "<p>We should use a dict.</p>",
      format: "html",
      replyToId: null,
    },
  ],
};

const sampleExtraction: ExtractionResult = {
  topicSlug: SLUG,
  models: { triage: "qwen3.5:4b", extract: "qwen3.5:9b" },
  posts: [
    {
      postId: 1,
      bodyClean: "We should use a dict.",
      signalScore: 3,
      triageLabel: "proposal",
      skipped: false,
    },
  ],
  decisions: [
    {
      key: "d1",
      title: "Use a list",
      kind: "alternative",
      status: "rejected",
      summary: "Rejected because it breaks old code.",
      confidence: "high",
      decidedAt: "2024-01-02T00:00:00.000Z",
      model: "qwen3.5:9b",
      reasons: [
        {
          text: "it breaks old code",
          evidence: [{ postId: 1, quote: "We should use a dict.", verified: true, matchScore: 1 }],
        },
      ],
    },
  ],
};

describe.skipIf(!databaseUrl)("the API (needs DATABASE_URL)", () => {
  let app: ReturnType<typeof createApp>;
  let pool: ReturnType<typeof createPool>;
  let database: TestDatabase;
  let topics: TopicsRepository;
  let decisions: DecisionsRepository;
  let identities: IdentityRepository;

  beforeAll(async () => {
    database = await createTestDatabase(databaseUrl ?? "", "dejaview_test_api");
    pool = database.pool;
    topics = new TopicsRepository(pool);
    decisions = new DecisionsRepository(pool);
    identities = new IdentityRepository(pool);
    app = createApp(
      createContext(pool, simplePrMatcher, { apiToken: API_TOKEN, dashboardUrl: "http://localhost:3000" }),
    );
  });

  afterAll(async () => {
    await database.drop();
  });

  async function seed(): Promise<void> {
    const saved = await topics.saveThread(sampleThread);
    await topics.updateAnnotations(saved.postIds, sampleExtraction.posts);
    await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });
  }

  it("answers the health check", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(response.body.db).toBe(true);
    expect(typeof response.body.llm).toBe("boolean");
  });

  it("queues an ingest job when we give it a URL", async () => {
    const response = await request(app)
      .post("/api/ingest")
      .send({
        url: "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046",
        topicSlug: "pep-701",
        pepNumber: 701,
      });

    expect(response.status).toBe(202);
    expect(response.body.topicSlug).toBe("pep-701");
    expect(response.body.jobId).toBeGreaterThan(0);

    const job = await request(app).get(`/api/jobs/${response.body.jobId}`);
    expect(job.status).toBe(200);
    expect(job.body.type).toBe("ingest");
    expect(job.body.status).toBe("queued");
  });

  it("gives the topic slug a name when we do not send one", async () => {
    const response = await request(app)
      .post("/api/ingest")
      .send({ url: "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839" });
    expect(response.status).toBe(202);
    expect(response.body.topicSlug).toBe("pep-698-a-typing-override-decorator");
  });

  it("says what is missing when the request is empty", async () => {
    const response = await request(app).post("/api/ingest").send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/url/);
  });

  it("tells the dashboard which job comes next", async () => {
    const first = await request(app).post("/api/ingest").send({ url: "https://example.com/t/1" });
    expect(first.status).toBe(202);

    // The worker records the parent id in the child's payload.
    await pool.query(
      "INSERT INTO jobs (type, payload) VALUES ('extract', $1::jsonb)",
      [JSON.stringify({ topicSlug: "x", parentJobId: first.body.jobId })],
    );

    const response = await request(app).get(`/api/jobs/${first.body.jobId}`);
    expect(response.status).toBe(200);
    expect(response.body.nextJobId).toBeGreaterThan(first.body.jobId);
  });

  it("keeps the extension of an uploaded file, so a .md is read as Markdown", async () => {
    const response = await request(app)
      .post("/api/ingest")
      .field("topicSlug", "uploaded-md")
      .attach("file", Buffer.from("Author: alice\nWe should use a dict.\n"), "discussion.md");

    expect(response.status).toBe(202);

    const job = await pool.query<{ payload: { filePath: string } }>(
      "SELECT payload FROM jobs WHERE id = $1",
      [response.body.jobId],
    );
    const filePath = job.rows[0]?.payload.filePath ?? "";
    expect(filePath.endsWith(".md")).toBe(true);
    if (filePath) rmSync(filePath, { force: true });
  });

  it("lists the topics with their counters", async () => {
    await seed();
    const response = await request(app).get("/api/topics");
    expect(response.status).toBe(200);
    const topic = response.body.find((entry: { slug: string }) => entry.slug === SLUG);
    expect(topic.decisionCount).toBe(1);
    expect(topic.rejectedCount).toBe(1);
    expect(topic.sourceCount).toBe(1);
  });

  it("shows one topic with its sources and decisions", async () => {
    await seed();
    const response = await request(app).get(`/api/topics/${SLUG}`);
    expect(response.status).toBe(200);
    expect(response.body.slug).toBe(SLUG);
    expect(response.body.sources).toHaveLength(1);
    expect(response.body.decisions).toHaveLength(1);
  });

  it("answers 404 for a topic we do not have", async () => {
    const response = await request(app).get("/api/topics/no-such-topic");
    expect(response.status).toBe(404);
  });

  it("shows the timeline of a topic", async () => {
    await seed();
    const response = await request(app).get(`/api/topics/${SLUG}/timeline`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].triageLabel).toBe("proposal");
  });

  it("searches the decisions by text", async () => {
    await seed();
    const response = await request(app).get("/api/decisions").query({ q: "breaks old code" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].title).toBe("Use a list");
  });

  it("filters the decisions by status", async () => {
    await seed();
    const accepted = await request(app).get("/api/decisions").query({ status: "accepted" });
    expect(accepted.body).toHaveLength(0);
    const rejected = await request(app).get("/api/decisions").query({ status: "rejected" });
    expect(rejected.body).toHaveLength(1);
  });

  it("names the person on the decision card, not just the handle", async () => {
    await seed();
    // The same human, known by a display name as well as the handle.
    await identities.remember({
      platform: "discourse",
      handle: "alice",
      displayName: "Alice Example",
    });

    const list = await request(app).get("/api/decisions").query({ q: "breaks old code" });
    const response = await request(app).get(`/api/decisions/${list.body[0].id}`);
    expect(response.status).toBe(200);
    expect(response.body.people).toContain("Alice Example");

    // Put the identity back the way it was, so the next test is not affected.
    await pool.query("DELETE FROM identities");
    await pool.query("DELETE FROM people");
  });

  it("shows one decision card", async () => {
    await seed();
    const list = await request(app).get("/api/decisions").query({ q: "breaks old code" });
    const id = list.body[0].id;
    const response = await request(app).get(`/api/decisions/${id}`);
    expect(response.status).toBe(200);
    expect(response.body.reasons[0].evidence[0].verified).toBe(true);
    expect(response.body.people).toEqual(["alice"]);
  });

  it("shows the model calls behind a decision", async () => {
    await seed();
    const list = await request(app).get("/api/decisions").query({ q: "breaks old code" });
    const response = await request(app).get(`/api/decisions/${list.body[0].id}/llm-calls`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("refuses a PR check without the token", async () => {
    const response = await request(app)
      .post("/api/pr-check")
      .send({ repo: "python/cpython", prNumber: 1, title: "t", body: "", files: [], symbols: [] });
    expect(response.status).toBe(401);
  });

  it("answers a PR check with the token and logs it", async () => {
    const response = await request(app)
      .post("/api/pr-check")
      .set("Authorization", `Bearer ${API_TOKEN}`)
      .send({
        repo: "python/cpython",
        prNumber: 42,
        title: "Rewrite the parser in Rust",
        body: "This is much faster.",
        files: [{ path: "Lib/parser.py", previousPath: null }],
        symbols: ["parse"],
      });

    expect(response.status).toBe(200);
    expect(typeof response.body.commentMarkdown).toBe("string");
    expect(response.body.commentMarkdown).toContain("dejaview");

    const log = await request(app).get("/api/pr-checks");
    expect(log.status).toBe(200);
    expect(log.body[0].request.prNumber).toBe(42);
    // The title used to come back empty.
    expect(log.body[0].request.title).toBe("Rewrite the parser in Rust");
  });

  it("queues an evaluation and lists the ones we have", async () => {
    await seed();
    const queued = await request(app).post(`/api/eval/${SLUG}`);
    expect(queued.status).toBe(202);
    expect(queued.body.jobId).toBeGreaterThan(0);

    const list = await request(app).get("/api/eval");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.body)).toBe(true);
  });

  it("answers 404 for a route we do not have", async () => {
    const response = await request(app).get("/api/nope");
    expect(response.status).toBe(404);
  });
});
