// The job queue. One Postgres table, no Redis.
//
// How a job is claimed:
//   1. One statement selects a free job and marks it running. The SELECT ... FOR UPDATE SKIP LOCKED
//      inside makes sure two workers never take the same job: the second one skips the row the
//      first one is holding.
//   2. The statement commits before the slow work starts. We never hold a database transaction
//      open while the LLM is working - that would keep a connection and a row lock busy for minutes.
//   3. attempt is a fencing token. Every later write carries it, so a worker that was too slow and
//      lost its job cannot overwrite the result of the worker that took over.
//   4. locked_until is a lease. If the worker crashes, the lease runs out and the job becomes
//      claimable again instead of staying "running" forever.

import type { JobStatus, JobType } from "@dejaview/shared";
import type { Pool } from "pg";

export interface JobRow {
  id: number;
  type: JobType;
  payload: Record<string, unknown>;
  status: JobStatus;
  stage: string | null;
  progress: number;
  error: string | null;
  attempt: number;
  started_at: Date | null;
  locked_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** How long a worker may hold a job before another worker may take it over. */
export const DEFAULT_LEASE_SECONDS = 1800;

export class JobsRepository {
  constructor(private readonly pool: Pool) {}

  async enqueue(type: JobType, payload: Record<string, unknown>): Promise<JobRow> {
    const result = await this.pool.query<JobRow>(
      `INSERT INTO jobs (type, payload) VALUES ($1, $2::jsonb) RETURNING *`,
      [type, JSON.stringify(payload)],
    );
    const row = result.rows[0];
    if (!row) throw new Error("The job was not inserted");
    return row;
  }

  /**
   * Takes the next free job and marks it running. Returns null when there is nothing to do.
   * The lease is set here, so a worker that dies leaves a job that comes back after the lease.
   */
  async claimNext(leaseSeconds: number = DEFAULT_LEASE_SECONDS): Promise<JobRow | null> {
    const result = await this.pool.query<JobRow>(
      `UPDATE jobs
          SET status = 'running',
              attempt = attempt + 1,
              started_at = now(),
              locked_until = now() + make_interval(secs => $1::double precision),
              updated_at = now()
        WHERE id = (
          SELECT id
            FROM jobs
           WHERE status = 'queued'
              OR (status = 'running' AND locked_until IS NOT NULL AND locked_until < now())
           ORDER BY id
           LIMIT 1
           FOR UPDATE SKIP LOCKED
        )
        RETURNING *`,
      [leaseSeconds],
    );
    return result.rows[0] ?? null;
  }

  /** Pushes the lease further out while the worker is still alive. */
  async heartbeat(id: number, attempt: number, leaseSeconds: number = DEFAULT_LEASE_SECONDS): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
          SET locked_until = now() + make_interval(secs => $3::double precision),
              updated_at = now()
        WHERE id = $1 AND attempt = $2`,
      [id, attempt, leaseSeconds],
    );
  }

  async updateProgress(id: number, attempt: number, stage: string, progress: number): Promise<void> {
    await this.pool.query(
      `UPDATE jobs SET stage = $3, progress = $4, updated_at = now() WHERE id = $1 AND attempt = $2`,
      [id, attempt, stage, progress],
    );
  }

  /** Finishes a job. Only the worker that still owns it (same attempt) may do this. */
  async complete(id: number, attempt: number, stage = "done"): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
          SET status = 'done', stage = $3, progress = 1, locked_until = NULL, updated_at = now()
        WHERE id = $1 AND attempt = $2`,
      [id, attempt, stage],
    );
  }

  async fail(id: number, attempt: number, error: string): Promise<void> {
    await this.pool.query(
      `UPDATE jobs
          SET status = 'failed', error = $3, locked_until = NULL, updated_at = now()
        WHERE id = $1 AND attempt = $2`,
      [id, attempt, error],
    );
  }

  async getById(id: number): Promise<JobRow | null> {
    const result = await this.pool.query<JobRow>("SELECT * FROM jobs WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  }

  /**
   * The job this one started, if any. The worker puts the parent's id in the child's payload,
   * so the dashboard can follow ingest -> extract -> link without guessing the ids.
   */
  async nextJobId(id: number): Promise<number | null> {
    const result = await this.pool.query<{ id: number }>(
      "SELECT id FROM jobs WHERE payload->>'parentJobId' = $1 ORDER BY id LIMIT 1",
      [String(id)],
    );
    return result.rows[0]?.id ?? null;
  }

  async list(limit = 50): Promise<JobRow[]> {
    const result = await this.pool.query<JobRow>(
      "SELECT * FROM jobs ORDER BY id DESC LIMIT $1",
      [limit],
    );
    return result.rows;
  }
}
