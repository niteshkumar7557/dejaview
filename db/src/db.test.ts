// Real tests against a real Postgres. No mocks, no stubs.
//
// The CI gives us a Postgres 16 service and runs `npm run migrate` before `npm test`, so
// DATABASE_URL is set there. When it is not set (for example on a laptop without Postgres),
// these tests skip instead of failing.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ExtractionResult, Thread } from "@dejaview/shared";
import type { Pool } from "pg";
import { createTestDatabase, type TestDatabase } from "./testing.js";
import { DecisionsRepository } from "./decisions.js";
import { EvalRunsRepository } from "./evalRuns.js";
import { JobsRepository } from "./jobs.js";
import { PostgresLlmCallStore } from "./llmCalls.js";
import { PrChecksRepository } from "./prChecks.js";
import { TimelineRepository } from "./timeline.js";
import { TopicsRepository } from "./topics.js";

const databaseUrl = process.env.DATABASE_URL;
const SLUG = "test-topic-dejaview";

const sampleThread: Thread = {
  topic: { slug: SLUG, title: "Test topic", pepNumber: 999 },
  source: {
    kind: "discourse",
    url: "https://discuss.python.org/t/test-topic/1",
    title: "Test topic",
    externalId: "1",
  },
  posts: [
    {
      id: 1,
      externalId: "1",
      author: "alice",
      createdAt: "2024-01-01T00:00:00.000Z",
      url: "https://discuss.python.org/t/test-topic/1/1",
      body: "<p>We should use a dict instead of a list.</p>",
      format: "html",
      likes: 3,
      replyToId: null,
    },
    {
      id: 2,
      externalId: "2",
      author: "bob",
      createdAt: "2024-01-02T00:00:00.000Z",
      url: "https://discuss.python.org/t/test-topic/1/2",
      body: "<p>A list is simpler and faster here.</p>",
      format: "html",
      replyToId: 1,
    },
  ],
};

const sampleExtraction: ExtractionResult = {
  topicSlug: SLUG,
  models: { triage: "qwen3.5:4b", extract: "qwen3.5:9b" },
  posts: [
    {
      postId: 1,
      bodyClean: "We should use a dict instead of a list.",
      signalScore: 4.5,
      triageLabel: "proposal",
      skipped: false,
    },
    {
      postId: 2,
      bodyClean: "A list is simpler and faster here.",
      signalScore: 2.1,
      triageLabel: "alternative",
      skipped: false,
    },
  ],
  decisions: [
    {
      key: "d1",
      title: "Use a list instead of a dict",
      kind: "alternative",
      status: "rejected",
      summary: "The list was rejected because it breaks old code.",
      confidence: "high",
      decidedAt: "2024-01-02T00:00:00.000Z",
      model: "qwen3.5:9b",
      reasons: [
        {
          text: "it breaks old code",
          evidence: [
            {
              postId: 2,
              quote: "A list is simpler and faster here.",
              verified: true,
              matchScore: 1,
            },
          ],
        },
      ],
    },
  ],
};

describe.skipIf(!databaseUrl)("the data layer (needs DATABASE_URL)", () => {
  let pool: Pool;
  let database: TestDatabase;
  let topics: TopicsRepository;
  let decisions: DecisionsRepository;
  let jobs: JobsRepository;
  let llmCalls: PostgresLlmCallStore;
  let evalRuns: EvalRunsRepository;
  let prChecks: PrChecksRepository;
  let timeline: TimelineRepository;

  beforeAll(async () => {
    database = await createTestDatabase(databaseUrl ?? "", "dejaview_test_db");
    pool = database.pool;
    topics = new TopicsRepository(pool);
    decisions = new DecisionsRepository(pool);
    jobs = new JobsRepository(pool);
    llmCalls = new PostgresLlmCallStore(pool);
    evalRuns = new EvalRunsRepository(pool);
    prChecks = new PrChecksRepository(pool);
    timeline = new TimelineRepository(pool);
  });

  afterAll(async () => {
    await database.drop();
  });

  it("saves a thread and maps every post to its database id", async () => {
    const saved = await topics.saveThread(sampleThread);

    expect(saved.topicId).toBeGreaterThan(0);
    expect(saved.sourceId).toBeGreaterThan(0);
    expect(saved.postIds.size).toBe(2);
    expect(saved.postIds.get("1")).toBeGreaterThan(0);

    const rows = await pool.query<{ author_handle: string; body_raw: string }>(
      "SELECT author_handle, body_raw FROM posts ORDER BY id",
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]?.author_handle).toBe("alice");
  });

  it("does not pile up copies when the same thread is ingested twice", async () => {
    await topics.saveThread(sampleThread);
    await topics.saveThread(sampleThread);

    const sources = await pool.query<{ count: string }>(
      "SELECT count(*) FROM sources WHERE topic_id = (SELECT id FROM topics WHERE slug = $1)",
      [SLUG],
    );
    expect(Number(sources.rows[0]?.count)).toBe(1);

    const posts = await pool.query<{ count: string }>("SELECT count(*) FROM posts");
    expect(Number(posts.rows[0]?.count)).toBe(2);
  });

  it("writes what the pipeline learned about each post", async () => {
    const saved = await topics.saveThread(sampleThread);
    const updated = await topics.updateAnnotations(saved.postIds, sampleExtraction.posts);
    expect(updated).toBe(2);

    const row = await pool.query<{
      body_clean: string;
      signal_score: number;
      triage_label: string;
      skipped: boolean;
    }>("SELECT body_clean, signal_score, triage_label, skipped FROM posts WHERE id = $1", [
      saved.postIds.get("1"),
    ]);
    expect(row.rows[0]?.body_clean).toBe("We should use a dict instead of a list.");
    expect(row.rows[0]?.signal_score).toBeCloseTo(4.5);
    expect(row.rows[0]?.triage_label).toBe("proposal");
  });

  it("saves decisions, reasons and evidence and finds them by full text", async () => {
    const saved = await topics.saveThread(sampleThread);
    const decisionIds = await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    expect(decisionIds).toHaveLength(1);
    const decisionId = decisionIds[0];
    expect(decisionId).toBeGreaterThan(0);

    // The evidence must point at the real post row, not at the thread's post number.
    const evidence = await pool.query<{ post_id: number | null; verified: boolean }>(
      "SELECT post_id, verified FROM evidence WHERE decision_id = $1",
      [decisionId],
    );
    expect(evidence.rows[0]?.post_id).toBe(saved.postIds.get("2"));
    expect(evidence.rows[0]?.verified).toBe(true);

    const found = await decisions.search({ q: "breaks old code" });
    expect(found).toHaveLength(1);
    expect(found[0]?.title).toBe("Use a list instead of a dict");
    expect(found[0]?.status).toBe("rejected");
    expect(found[0]?.verifiedEvidence).toBe(1);
    expect(found[0]?.totalEvidence).toBe(1);
    expect(found[0]?.reasons).toEqual(["it breaks old code"]);
  });

  it("finds only the rejected decisions when we look for a similar rejected idea", async () => {
    const saved = await topics.saveThread(sampleThread);
    await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    const similar = await decisions.similarRejected("breaks old code");
    expect(similar).toHaveLength(1);

    const accepted = await decisions.similarRejected("nothing matches this at all");
    expect(accepted).toHaveLength(0);
  });

  it("finds a rejected idea from a long PR description that shares only some of its words", async () => {
    const saved = await topics.saveThread(sampleThread);
    await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    // Most of these words are not in the decision; "list", "dict", "breaks", "old" and "code" are.
    const pr = "Switch the config loader to use a list instead of a dict. This breaks old code for some users, " +
      "but the new loader is faster and easier to read, and we added a migration guide to the docs.";
    const similar = await decisions.similarRejected(pr);
    expect(similar.map((d) => d.title)).toEqual(["Use a list instead of a dict"]);

    // Sharing fewer than 3 meaningful words is not enough.
    expect(await decisions.similarRejected("the loader reads old settings files quickly")).toHaveLength(0);
  });

  it("does not let a long, unrelated rejected decision match through a few common words", async () => {
    // A real PR about functools.cache matched a PEP 701 f-string decision whose ten reasons share a few
    // everyday words with almost any text. Matches are ranked by shared words relative to the
    // decision's length, and a weak match is left out.
    const saved = await topics.saveThread(sampleThread);
    const filler = Array.from({ length: 150 }, (_, i) => `topicword${i}`).join(" ");
    await decisions.saveExtraction({
      topicId: saved.topicId,
      postIds: saved.postIds,
      result: {
        ...sampleExtraction,
        decisions: [
          ...sampleExtraction.decisions,
          {
            ...sampleExtraction.decisions[0]!,
            key: "d2",
            title: "Rewrite the parser in another language",
            summary: "Rejected after a long debate.",
            reasons: [{ text: `The config loader is faster for users, but ${filler}`, evidence: [] }],
          },
        ],
      },
    });

    const pr = "Switch the config loader to use a list instead of a dict. This breaks old code for some users, " +
      "but the new loader is faster and easier to read, and we added a migration guide to the docs.";
    expect((await decisions.similarRejected(pr)).map((d) => d.title)).toEqual(["Use a list instead of a dict"]);
  });

  it("builds the decision card with its reasons, evidence and people", async () => {
    const saved = await topics.saveThread(sampleThread);
    const [decisionId] = await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    const card = await decisions.getCard(decisionId ?? 0);
    expect(card?.title).toBe("Use a list instead of a dict");
    expect(card?.status).toBe("rejected");
    expect(card?.model).toBe("qwen3.5:9b");
    expect(card?.topic.slug).toBe(SLUG);
    expect(card?.reasons).toHaveLength(1);
    expect(card?.reasons[0]?.evidence[0]?.quote).toBe("A list is simpler and faster here.");
    expect(card?.reasons[0]?.evidence[0]?.verified).toBe(true);
    expect(card?.people).toEqual(["bob"]);
  });

  it("replaces a decision's code links when the link step runs again", async () => {
    // Re-running a link job (a retry after a crash, or a better linker) used to add every link a second time.
    const saved = await topics.saveThread(sampleThread);
    const [decisionId] = await decisions.saveExtraction({ topicId: saved.topicId, result: sampleExtraction, postIds: saved.postIds });
    const anchor = (symbol: string, file: string) => ({
      repo: "python/cpython", symbol, originalPath: file, originalCommit: null, currentPath: file,
      relocatedBy: null, linkMethod: "symbol_mention" as const, evidencePostId: null,
    });

    await decisions.saveAnchors(decisionId ?? 0, [anchor("__init__", "Lib/a.py"), anchor("__init__", "Lib/b.py")], saved.postIds);
    await decisions.saveAnchors(decisionId ?? 0, [anchor("typing.override", "Lib/typing.py")], saved.postIds);

    const card = await decisions.getCard(decisionId ?? 0);
    expect(card?.anchors.map((a) => a.currentPath)).toEqual(["Lib/typing.py"]);
  });

  it("shows the timeline with the posts that fed a decision", async () => {
    const saved = await topics.saveThread(sampleThread);
    await topics.updateAnnotations(saved.postIds, sampleExtraction.posts);
    const [decisionId] = await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    const posts = await timeline.forTopic(SLUG);
    expect(posts).toHaveLength(2);
    expect(posts[0]?.triageLabel).toBe("proposal");
    expect(posts[0]?.signalScore).toBeCloseTo(4.5);
    expect(posts[1]?.decisionIds).toContain(decisionId);
  });

  it("gives the topic its counters", async () => {
    const saved = await topics.saveThread(sampleThread);
    await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    const summaries = await topics.listSummaries();
    const summary = summaries.find((entry) => entry.slug === SLUG);
    expect(summary?.decisionCount).toBe(1);
    expect(summary?.rejectedCount).toBe(1);
    expect(summary?.sourceCount).toBe(1);
  });

  it("claims a job and gives it to only one worker", async () => {
    const job = await jobs.enqueue("extract", { topicSlug: SLUG });
    const first = await jobs.claimNext();
    const second = await jobs.claimNext();

    expect(first?.id).toBe(job.id);
    expect(first?.status).toBe("running");
    expect(first?.attempt).toBe(1);
    // The job is running now, so the second worker gets nothing.
    expect(second).toBeNull();
  });

  it("refuses a result from a worker that lost its job", async () => {
    const job = await jobs.enqueue("extract", { topicSlug: SLUG });
    const claimed = await jobs.claimNext();
    expect(claimed?.attempt).toBe(1);

    // The job is taken over by another worker (attempt 2).
    await pool.query(
      "UPDATE jobs SET attempt = 2, status = 'running' WHERE id = $1",
      [job.id],
    );
    await jobs.complete(job.id, claimed?.attempt ?? 1, "done");

    const row = await jobs.getById(job.id);
    // The stale write did nothing: the job is still running.
    expect(row?.status).toBe("running");
  });

  it("finishes a job when the worker still owns it", async () => {
    const job = await jobs.enqueue("ingest", { topicSlug: SLUG });
    const claimed = await jobs.claimNext();
    await jobs.updateProgress(job.id, claimed?.attempt ?? 0, "cleaning", 0.5);
    await jobs.complete(job.id, claimed?.attempt ?? 0, "done");

    const row = await jobs.getById(job.id);
    expect(row?.status).toBe("done");
    expect(row?.progress).toBe(1);
    expect(row?.locked_until).toBeNull();
  });

  it("keeps the last error on a failed job", async () => {
    const job = await jobs.enqueue("extract", { topicSlug: SLUG });
    const claimed = await jobs.claimNext();
    await jobs.fail(job.id, claimed?.attempt ?? 0, "the model timed out");

    const row = await jobs.getById(job.id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe("the model timed out");
  });

  it("gives a crashed worker's job back after the lease runs out", async () => {
    const job = await jobs.enqueue("extract", { topicSlug: SLUG });
    const claimed = await jobs.claimNext();
    expect(claimed?.id).toBe(job.id);

    // Pretend the worker died: the lease runs out.
    await pool.query(
      "UPDATE jobs SET locked_until = now() - interval '1 second' WHERE id = $1",
      [job.id],
    );

    const takenOver = await jobs.claimNext();
    expect(takenOver?.id).toBe(job.id);
    expect(takenOver?.attempt).toBe(2);
  });

  it("caches a model call by its prompt hash", async () => {
    const record = {
      promptHash: "hash-abc",
      model: "qwen3.5:9b",
      stage: "extract" as const,
      prompt: "extract this",
      response: { ideas: [] },
      durationMs: 1234,
    };
    await llmCalls.save(record);

    const again = await llmCalls.get("hash-abc");
    expect(again?.model).toBe("qwen3.5:9b");
    expect(again?.durationMs).toBe(1234);
    expect(await llmCalls.get("not-a-known-hash")).toBeNull();
  });

  it("shows the model calls behind a decision", async () => {
    const saved = await topics.saveThread(sampleThread);
    const [decisionId] = await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });
    const job = await jobs.enqueue("extract", { topicSlug: SLUG });
    const store = new PostgresLlmCallStore(pool, job.id);
    await store.save({
      promptHash: "hash-for-decision",
      model: "qwen3.5:9b",
      stage: "consolidate",
      prompt: "merge these ideas",
      response: { ideas: [] },
      durationMs: 99,
    });
    await store.linkJobCallsToDecisions(job.id, [decisionId ?? 0]);

    const calls = await llmCalls.listForDecision(decisionId ?? 0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.model).toBe("qwen3.5:9b");
    expect(calls[0]?.prompt).toBe("merge these ideas");
  });

  it("keeps the audit trail when a re-run reuses earlier model answers", async () => {
    // Ingesting a thread again answers every prompt from the stored calls; the new decisions showed
    // "0 model calls" because only calls made by the new job were linked.
    const first = await jobs.enqueue("extract", { topicSlug: SLUG });
    await new PostgresLlmCallStore(pool, first.id).save({
      promptHash: "hash-reused-later", model: "qwen3.5:9b", stage: "extract",
      prompt: "find the ideas", response: { ideas: [] }, durationMs: 80000,
    });

    const saved = await topics.saveThread(sampleThread);
    const [decisionId] = await decisions.saveExtraction({ topicId: saved.topicId, result: sampleExtraction, postIds: saved.postIds });
    const rerun = await jobs.enqueue("extract", { topicSlug: SLUG });
    const store = new PostgresLlmCallStore(pool, rerun.id);
    expect(await store.get("hash-reused-later")).not.toBeNull();
    await store.linkCallsToDecisions([decisionId ?? 0]);

    const calls = await llmCalls.listForDecision(decisionId ?? 0);
    expect(calls.map((c) => c.prompt)).toEqual(["find the ideas"]);
  });

  it("saves and reads the eval scorecard", async () => {
    const saved = await topics.saveThread(sampleThread);
    await evalRuns.save({
      topicId: saved.topicId,
      result: {
        pepNumber: 999,
        groundTruth: [{ title: "Rejected idea", text: "because of reasons" }],
        matches: [
          {
            groundTruth: { title: "Rejected idea", text: "because of reasons" },
            decisionKey: "d1",
            decisionId: null,
            reasonAgreement: "yes",
          },
        ],
        recall: 1,
        reasonAgreement: 1,
        extraIdeas: 0,
      },
    });

    const runs = await evalRuns.list();
    expect(runs).toHaveLength(1);
    expect(runs[0]?.pepNumber).toBe(999);
    expect(runs[0]?.recall).toBe(1);
    expect(runs[0]?.topic.slug).toBe(SLUG);
  });

  it("tells which job a job started", async () => {
    const first = await jobs.enqueue("ingest", { topicSlug: SLUG });
    const second = await jobs.enqueue("extract", {
      topicSlug: SLUG,
      parentJobId: first.id,
    });

    expect(await jobs.nextJobId(first.id)).toBe(second.id);
    expect(await jobs.nextJobId(second.id)).toBeNull();
  });

  it("keeps the key the pipeline gave a decision", async () => {
    const saved = await topics.saveThread(sampleThread);
    await decisions.saveExtraction({
      topicId: saved.topicId,
      result: sampleExtraction,
      postIds: saved.postIds,
    });

    const id = await decisions.idByKey(saved.topicId, "d1");
    expect(id).toBeGreaterThan(0);
    expect(await decisions.idByKey(saved.topicId, "not-a-key")).toBeNull();
  });

  it("saves and reads the PR check log", async () => {
    await prChecks.save({
      repo: "python/cpython",
      prNumber: 12345,
      title: "Rewrite the parser in Rust",
      matchedDecisionIds: [1, 2],
      similarRejectedIds: [3],
      commentBody: "## DejaView check",
    });

    const checks = await prChecks.list();
    expect(checks).toHaveLength(1);
    expect(checks[0]?.request.repo).toBe("python/cpython");
    expect(checks[0]?.request.title).toBe("Rewrite the parser in Rust");
    expect(checks[0]?.decisionIds).toEqual([1, 2]);
    expect(checks[0]?.commentMarkdown).toBe("## DejaView check");
  });
});
