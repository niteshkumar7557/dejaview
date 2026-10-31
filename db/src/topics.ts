// Topics, sources and posts.
//
// A "topic" is a PEP or any other decision area. It can hold several "sources" (one forum thread,
// one GitHub issue, one uploaded file) and every source holds the posts.
//
// One thing to know: the pipeline speaks in ThreadPost.id (the post number inside a thread), but
// the database gives every post its own serial id. SavedThread.postIds maps one to the other, so
// the evidence a decision cites can be pointed at the right row.

import type {
  PostAnnotation,
  SourceView,
  Thread,
  ThreadPost,
  TopicSummary,
  TriageLabel,
} from "@dejaview/shared";
import type { Pool } from "pg";
import { withTransaction } from "./client.js";

export interface SavedThread {
  topicId: number;
  sourceId: number;
  /** String(ThreadPost.id) -> posts.id */
  postIds: Map<string, number>;
}

export interface TopicRow {
  id: number;
  slug: string;
  title: string;
  pep_number: number | null;
  created_at: Date;
}

export class TopicsRepository {
  constructor(private readonly pool: Pool) {}

  /** Creates the topic, or updates it when we already have one with that slug. */
  async upsertTopic(input: {
    slug: string;
    title: string;
    pepNumber: number | null;
  }): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO topics (slug, title, pep_number)
            VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
              SET title = EXCLUDED.title,
                  pep_number = COALESCE(EXCLUDED.pep_number, topics.pep_number)
         RETURNING id`,
      [input.slug, input.title, input.pepNumber],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`Could not save topic ${input.slug}`);
    return row.id;
  }

  async createSource(input: {
    topicId: number;
    kind: string;
    url: string | null;
    title: string | null;
    externalId: string | null;
    raw: unknown;
  }): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO sources (topic_id, kind, url, title, external_id, raw)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (topic_id, kind, external_id) DO UPDATE
              SET url = EXCLUDED.url,
                  title = EXCLUDED.title,
                  raw = EXCLUDED.raw,
                  fetched_at = now()
         RETURNING id`,
      [
        input.topicId,
        input.kind,
        input.url,
        input.title,
        input.externalId,
        JSON.stringify(input.raw ?? {}),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Could not save source");
    return row.id;
  }

  /** Saves the posts of one source and tells the caller which database row each post got. */
  async savePosts(sourceId: number, posts: ThreadPost[]): Promise<Map<string, number>> {
    const postIds = new Map<string, number>();
    for (const post of posts) {
      const result = await this.pool.query<{ id: number }>(
        `INSERT INTO posts (source_id, external_id, thread_post_id, author_handle, created_at, url, body_raw, body_clean)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
         ON CONFLICT (source_id, external_id) DO UPDATE
                SET thread_post_id = EXCLUDED.thread_post_id,
                    author_handle = EXCLUDED.author_handle,
                    created_at = EXCLUDED.created_at,
                    url = EXCLUDED.url,
                    body_raw = EXCLUDED.body_raw,
                    body_clean = EXCLUDED.body_raw
           RETURNING id`,
        [sourceId, post.externalId, post.id, post.author, post.createdAt, post.url, post.body],
      );
      const row = result.rows[0];
      if (row) postIds.set(String(post.id), row.id);
    }
    return postIds;
  }

  /** Saves a whole thread: topic, source and posts, in one transaction. */
  async saveThread(thread: Thread): Promise<SavedThread> {
    return withTransaction(this.pool, async (client) => {
      const topicResult = await client.query<{ id: number }>(
        `INSERT INTO topics (slug, title, pep_number)
              VALUES ($1, $2, $3)
         ON CONFLICT (slug) DO UPDATE
                SET title = EXCLUDED.title,
                    pep_number = COALESCE(EXCLUDED.pep_number, topics.pep_number)
           RETURNING id`,
        [thread.topic.slug, thread.topic.title, thread.topic.pepNumber],
      );
      const topicId = topicResult.rows[0]?.id;
      if (!topicId) throw new Error(`Could not save topic ${thread.topic.slug}`);

      // An uploaded file has no id on any platform, so the topic slug stands in for one. That
      // keeps the UNIQUE (topic_id, kind, external_id) rule working for uploads too.
      const externalId = thread.source.externalId ?? thread.topic.slug;
      const sourceResult = await client.query<{ id: number }>(
        `INSERT INTO sources (topic_id, kind, url, title, external_id, raw)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (topic_id, kind, external_id) DO UPDATE
                SET url = EXCLUDED.url,
                    title = EXCLUDED.title,
                    raw = EXCLUDED.raw,
                    fetched_at = now()
           RETURNING id`,
        [
          topicId,
          thread.source.kind,
          thread.source.url,
          thread.source.title,
          externalId,
          JSON.stringify(thread),
        ],
      );
      const sourceId = sourceResult.rows[0]?.id;
      if (!sourceId) throw new Error("Could not save source");

      const postIds = new Map<string, number>();
      for (const post of thread.posts) {
        const result = await client.query<{ id: number }>(
          `INSERT INTO posts (source_id, external_id, thread_post_id, author_handle, created_at, url, body_raw, body_clean)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
           ON CONFLICT (source_id, external_id) DO UPDATE
                  SET thread_post_id = EXCLUDED.thread_post_id,
                      author_handle = EXCLUDED.author_handle,
                      created_at = EXCLUDED.created_at,
                      url = EXCLUDED.url,
                      body_raw = EXCLUDED.body_raw,
                      body_clean = EXCLUDED.body_raw
             RETURNING id`,
          [sourceId, post.externalId, post.id, post.author, post.createdAt, post.url, post.body],
        );
        const row = result.rows[0];
        if (row) postIds.set(String(post.id), row.id);
      }

      return { topicId, sourceId, postIds };
    });
  }

  /**
   * Writes what the pipeline learned about each post: the cleaned text, the signal score, the
   * triage label and whether the post was skipped.
   */
  async updateAnnotations(
    postIds: Map<string, number>,
    annotations: PostAnnotation[],
  ): Promise<number> {
    let updated = 0;
    for (const annotation of annotations) {
      const postId = postIds.get(String(annotation.postId));
      if (!postId) continue;
      await this.pool.query(
        `UPDATE posts
            SET body_clean = $2,
                signal_score = $3,
                triage_label = $4,
                skipped = $5
          WHERE id = $1`,
        [
          postId,
          annotation.bodyClean,
          annotation.signalScore,
          annotation.triageLabel,
          annotation.skipped,
        ],
      );
      updated += 1;
    }
    return updated;
  }

  async getBySlug(slug: string): Promise<TopicRow | null> {
    const result = await this.pool.query<TopicRow>("SELECT * FROM topics WHERE slug = $1", [slug]);
    return result.rows[0] ?? null;
  }

  async list(): Promise<TopicRow[]> {
    const result = await this.pool.query<TopicRow>("SELECT * FROM topics ORDER BY id");
    return result.rows;
  }

  /** Reads a thread back exactly as it was fetched. The raw JSON is kept in sources.raw. */
  async loadThread(sourceId: number): Promise<Thread | null> {
    const result = await this.pool.query<{ raw: Thread | null }>(
      "SELECT raw FROM sources WHERE id = $1",
      [sourceId],
    );
    return result.rows[0]?.raw ?? null;
  }

  /** What the pipeline learned about the posts of one source. */
  async loadAnnotations(sourceId: number): Promise<PostAnnotation[]> {
    const result = await this.pool.query<{
      thread_post_id: number | null;
      body_clean: string;
      signal_score: number | null;
      triage_label: TriageLabel | null;
      skipped: boolean;
    }>(
      `SELECT thread_post_id, body_clean, signal_score, triage_label, skipped
         FROM posts WHERE source_id = $1 ORDER BY id`,
      [sourceId],
    );
    return result.rows.map((row) => ({
      postId: row.thread_post_id ?? 0,
      bodyClean: row.body_clean,
      signalScore: row.signal_score ?? 0,
      triageLabel: row.triage_label,
      skipped: row.skipped,
    }));
  }

  /** The topics with the numbers the dashboard shows next to each of them. */
  async listSummaries(): Promise<TopicSummary[]> {
    const result = await this.pool.query<{
      slug: string;
      title: string;
      pep_number: number | null;
      decision_count: string;
      rejected_count: string;
      source_count: string;
      last_recall: number | null;
    }>(
      `SELECT t.slug,
              t.title,
              t.pep_number,
              (SELECT count(*) FROM decisions d WHERE d.topic_id = t.id) AS decision_count,
              (SELECT count(*) FROM decisions d
                WHERE d.topic_id = t.id AND d.status = 'rejected') AS rejected_count,
              (SELECT count(*) FROM sources s WHERE s.topic_id = t.id) AS source_count,
              (SELECT e.recall FROM eval_runs e
                WHERE e.topic_id = t.id ORDER BY e.id DESC LIMIT 1) AS last_recall
         FROM topics t
        ORDER BY t.id`,
    );
    return result.rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      pepNumber: row.pep_number,
      decisionCount: Number(row.decision_count),
      rejectedCount: Number(row.rejected_count),
      sourceCount: Number(row.source_count),
      lastRecall: row.last_recall,
    }));
  }

  /** The threads and files that belong to one topic. */
  async listSources(topicSlug: string): Promise<SourceView[]> {
    const result = await this.pool.query<{
      kind: SourceView["kind"];
      url: string | null;
      title: string | null;
    }>(
      `SELECT s.kind, s.url, s.title
         FROM sources s
         JOIN topics t ON t.id = s.topic_id
        WHERE t.slug = $1
        ORDER BY s.id`,
      [topicSlug],
    );
    return result.rows.map((row) => ({ kind: row.kind, url: row.url, title: row.title }));
  }
}
