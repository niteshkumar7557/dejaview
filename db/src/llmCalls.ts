// The audit trail: every call we made to the model, stored with the prompt and the answer.
//
// The shared contract calls for an LlmCallStore, so the pipeline can ask "have I already asked
// this exact thing?" and get the old answer back. Abhijeet's pipeline uses this to resume after a
// crash without calling the model again.

import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";
import type { Pool } from "pg";

interface LlmCallRow {
  id: number;
  prompt_hash: string;
  model: string;
  stage: string;
  prompt: string;
  response: unknown;
  duration_ms: number | null;
  created_at: Date;
}

export class PostgresLlmCallStore implements LlmCallStore {
  /** Stored calls this store answered from (a re-run reuses earlier answers instead of asking again). */
  private readonly reusedCallIds = new Set<number>();

  constructor(
    private readonly pool: Pool,
    private readonly jobId: number | null = null,
  ) {}

  async get(promptHash: string): Promise<LlmCallRecord | null> {
    const result = await this.pool.query<LlmCallRow>(
      "SELECT * FROM llm_calls WHERE prompt_hash = $1",
      [promptHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    this.reusedCallIds.add(row.id);
    return {
      promptHash: row.prompt_hash,
      model: row.model,
      stage: row.stage as LlmCallRecord["stage"],
      prompt: row.prompt,
      response: row.response,
      durationMs: row.duration_ms ?? 0,
    };
  }

  async save(record: LlmCallRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO llm_calls (job_id, prompt_hash, model, stage, prompt, response, duration_ms)
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (prompt_hash) DO UPDATE
              SET response = EXCLUDED.response,
                  duration_ms = EXCLUDED.duration_ms`,
      [
        this.jobId,
        record.promptHash,
        record.model,
        record.stage,
        record.prompt,
        JSON.stringify(record.response ?? null),
        record.durationMs,
      ],
    );
  }

  /** Points the decisions of one job at the calls that job made. */
  async linkJobCallsToDecisions(jobId: number, decisionIds: number[]): Promise<void> {
    if (decisionIds.length === 0) return;
    await this.pool.query(
      `INSERT INTO decision_llm_calls (decision_id, llm_call_id)
            SELECT d.id, c.id
              FROM unnest($1::int[]) AS d(id)
              JOIN llm_calls c ON c.job_id = $2
         ON CONFLICT DO NOTHING`,
      [decisionIds, jobId],
    );
  }

  /**
   * Points decisions at every call behind them: the ones this store's job made and the earlier ones
   * it reused. Linking only the job's own calls left a re-ingested thread with an empty audit trail.
   */
  async linkCallsToDecisions(decisionIds: number[]): Promise<void> {
    if (decisionIds.length === 0) return;
    await this.pool.query(
      `INSERT INTO decision_llm_calls (decision_id, llm_call_id)
            SELECT d.id, c.id
              FROM unnest($1::int[]) AS d(id)
              JOIN llm_calls c ON c.job_id = $2 OR c.id = ANY($3::int[])
         ON CONFLICT DO NOTHING`,
      [decisionIds, this.jobId, [...this.reusedCallIds]],
    );
  }

  /** The calls behind one decision, newest first. */
  async listForDecision(decisionId: number): Promise<LlmCallView[]> {
    const result = await this.pool.query<LlmCallRow>(
      `SELECT c.* FROM llm_calls c
         JOIN decision_llm_calls link ON link.llm_call_id = c.id
        WHERE link.decision_id = $1
        ORDER BY c.id DESC`,
      [decisionId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      model: row.model,
      stage: row.stage,
      prompt: row.prompt,
      response: row.response,
      durationMs: row.duration_ms,
      createdAt: row.created_at.toISOString(),
    }));
  }
}

export interface LlmCallView {
  id: number;
  model: string;
  stage: string;
  prompt: string;
  response: unknown;
  durationMs: number | null;
  createdAt: string;
}
