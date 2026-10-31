// The log of PR checks: what the bot was asked and what it answered.

import type { PrCheckView } from "@dejaview/shared";
import type { Pool } from "pg";

interface PrCheckRow {
  id: number;
  repo: string;
  pr_number: number;
  title: string | null;
  matched_decision_ids: number[];
  similar_rejected_ids: number[];
  comment_body: string;
  created_at: Date;
}

export class PrChecksRepository {
  constructor(private readonly pool: Pool) {}

  async save(input: {
    repo: string;
    prNumber: number;
    /** The pull request title, so the log does not show an empty title. */
    title?: string;
    matchedDecisionIds: number[];
    similarRejectedIds: number[];
    commentBody: string;
  }): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO pr_checks (repo, pr_number, title, matched_decision_ids, similar_rejected_ids, comment_body)
            VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
      [
        input.repo,
        input.prNumber,
        input.title ?? "",
        input.matchedDecisionIds,
        input.similarRejectedIds,
        input.commentBody,
      ],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error("Could not save the PR check");
    return id;
  }

  async list(): Promise<PrCheckView[]> {
    const result = await this.pool.query<PrCheckRow>(
      "SELECT * FROM pr_checks ORDER BY id DESC",
    );
    return result.rows.map((row) => ({
      id: row.id,
      request: { repo: row.repo, prNumber: row.pr_number, title: row.title ?? "" },
      decisionIds: row.matched_decision_ids,
      similarRejectedIds: row.similar_rejected_ids,
      commentMarkdown: row.comment_body,
      createdAt: row.created_at.toISOString(),
    }));
  }
}
