// The self-evaluation scorecard: what the real PEP lists, what we found, and how well they match.

import type { EvalResult, EvalRunView } from "@dejaview/shared";
import type { Pool } from "pg";

interface EvalRunRow {
  id: number;
  topic_id: number;
  pep_number: number;
  ground_truth: unknown;
  matches: unknown;
  recall: number;
  reason_agreement: number;
  extra_ideas: number;
  created_at: Date;
  topic_slug: string;
  topic_title: string;
  topic_pep_number: number | null;
}

export class EvalRunsRepository {
  constructor(private readonly pool: Pool) {}

  async save(input: { topicId: number; result: EvalResult }): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO eval_runs (topic_id, pep_number, ground_truth, matches, recall, reason_agreement, extra_ideas)
            VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7)
         RETURNING id`,
      [
        input.topicId,
        input.result.pepNumber,
        JSON.stringify(input.result.groundTruth),
        JSON.stringify(input.result.matches),
        input.result.recall,
        input.result.reasonAgreement,
        input.result.extraIdeas,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Could not save the eval run");
    return id;
  }

  async list(): Promise<EvalRunView[]> {
    const result = await this.pool.query<EvalRunRow>(
      `SELECT e.*, t.slug AS topic_slug, t.title AS topic_title, t.pep_number AS topic_pep_number
         FROM eval_runs e
         JOIN topics t ON t.id = e.topic_id
        ORDER BY e.id DESC`,
    );
    return result.rows.map((row) => ({
      id: row.id,
      topic: {
        slug: row.topic_slug,
        title: row.topic_title,
        pepNumber: row.topic_pep_number,
      },
      createdAt: row.created_at.toISOString(),
      pepNumber: row.pep_number,
      groundTruth: row.ground_truth as EvalResult["groundTruth"],
      matches: row.matches as EvalResult["matches"],
      recall: row.recall,
      reasonAgreement: row.reason_agreement,
      extraIdeas: row.extra_ideas,
    }));
  }
}
