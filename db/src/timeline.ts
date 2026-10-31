// The thread timeline: every post of a topic, what the pipeline thought of it, and which
// decisions quote it.

import type { TimelinePost, TriageLabel } from "@dejaview/shared";
import type { Pool } from "pg";

interface TimelineRow {
  id: number;
  author_handle: string;
  created_at: Date | null;
  url: string | null;
  body_clean: string;
  signal_score: number | null;
  triage_label: TriageLabel | null;
  skipped: boolean;
  decision_ids: number[] | null;
}

export class TimelineRepository {
  constructor(private readonly pool: Pool) {}

  async forTopic(topicSlug: string): Promise<TimelinePost[]> {
    const result = await this.pool.query<TimelineRow>(
      `SELECT p.id,
              p.author_handle,
              p.created_at,
              p.url,
              p.body_clean,
              p.signal_score,
              p.triage_label,
              p.skipped,
              COALESCE((SELECT array_agg(DISTINCT e.decision_id)
                           FROM evidence e WHERE e.post_id = p.id), '{}') AS decision_ids
         FROM posts p
         JOIN sources s ON s.id = p.source_id
         JOIN topics t ON t.id = s.topic_id
        WHERE t.slug = $1
        ORDER BY s.id, p.id`,
      [topicSlug],
    );

    return result.rows.map((row) => ({
      id: row.id,
      author: row.author_handle,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
      url: row.url,
      bodyClean: row.body_clean,
      signalScore: row.signal_score,
      triageLabel: row.triage_label,
      skipped: row.skipped,
      decisionIds: row.decision_ids ?? [],
    }));
  }
}
