// People and identities: the same human across discuss.python.org, GitHub and git.
//
// A "person" is one human. An "identity" is one of their handles on one platform. When two
// identities turn out to be the same person they are merged into one person row, and the
// merge keeps the confidence and the evidence that produced it, so nobody has to take the
// answer on trust.
//
// This is design.md §5.9: the brief asks how to recognise the same contributor across
// platforms, and the answer is "decide, with a score, and show your working".

import type { Pool } from "pg";
import {
  judgeMerge,
  normalizeDisplayName,
  normalizeHandle,
  type IdentityCandidate,
  type MergeVerdict,
  type Platform,
} from "./identityResolver.js";

export interface IdentityRecord {
  id: number;
  personId: number;
  platform: Platform;
  handle: string;
  email: string | null;
  confidence: number;
  evidence: string | null;
  displayName: string;
}

export interface PersonSummary {
  personId: number;
  displayName: string;
  /** Every handle we know for this person. */
  identities: { platform: Platform; handle: string; confidence: number; evidence: string | null }[];
}

interface IdentityRow {
  id: number;
  person_id: number;
  platform: Platform;
  handle: string;
  email: string | null;
  confidence: number;
  evidence: string | null;
  display_name: string;
}

/** The platform a source kind belongs to. */
export function platformForSource(kind: string): Platform {
  if (kind === "discourse") return "discourse";
  if (kind === "github_issue" || kind === "github_pr") return "github";
  return "unknown";
}

export class IdentityRepository {
  constructor(private readonly pool: Pool) {}

  async upsertPerson(displayName: string): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO people (display_name) VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [displayName],
    );
    const row = result.rows[0];
    if (row) return row.id;
    const existing = await this.pool.query<{ id: number }>(
      "SELECT id FROM people WHERE display_name = $1 LIMIT 1",
      [displayName],
    );
    const id = existing.rows[0]?.id;
    if (!id) throw new Error(`Could not save the person ${displayName}`);
    return id;
  }

  async findByHandle(platform: string, handle: string): Promise<IdentityRecord | null> {
    const result = await this.pool.query<IdentityRow>(
      `SELECT i.*, p.display_name
         FROM identities i JOIN people p ON p.id = i.person_id
        WHERE i.platform = $1 AND i.handle = $2
        LIMIT 1`,
      [platform, handle],
    );
    const row = result.rows[0];
    return row ? this.toRecord(row) : null;
  }

  async list(): Promise<IdentityRecord[]> {
    const result = await this.pool.query<IdentityRow>(
      `SELECT i.*, p.display_name
         FROM identities i JOIN people p ON p.id = i.person_id
        ORDER BY i.id`,
    );
    return result.rows.map((row) => this.toRecord(row));
  }

  async people(): Promise<PersonSummary[]> {
    const records = await this.list();
    const byPerson = new Map<number, PersonSummary>();
    for (const record of records) {
      const summary = byPerson.get(record.personId) ?? {
        personId: record.personId,
        displayName: record.displayName,
        identities: [],
      };
      summary.identities.push({
        platform: record.platform,
        handle: record.handle,
        confidence: record.confidence,
        evidence: record.evidence,
      });
      byPerson.set(record.personId, summary);
    }
    return [...byPerson.values()];
  }

  private toRecord(row: IdentityRow): IdentityRecord {
    return {
      id: row.id,
      personId: row.person_id,
      platform: row.platform,
      handle: row.handle,
      email: row.email,
      confidence: row.confidence,
      evidence: row.evidence,
      displayName: row.display_name,
    };
  }

  /**
   * Remembers a handle we saw, and links it to the person it belongs to.
   *
   * When the handle is new, we look for another platform that looks like the same human and
   * merge the two identities into one person, keeping the confidence and the evidence.
   */
  async remember(input: {
    platform: Platform;
    handle: string;
    displayName?: string | null;
    email?: string | null;
  }): Promise<{ identityId: number; personId: number; merged: boolean; evidence: string | null }> {
    const existing = await this.findByHandle(input.platform, input.handle);
    if (existing) {
      return {
        identityId: existing.id,
        personId: existing.personId,
        merged: false,
        evidence: existing.evidence,
      };
    }

    const displayName = input.displayName?.trim() || input.handle;
    const personId = await this.upsertPerson(displayName);

    const candidate: IdentityCandidate = {
      platform: input.platform,
      handle: input.handle,
      displayName,
      email: input.email ?? null,
    };

    // Look for an identity on another platform that is the same human.
    const others = (await this.list()).filter((record) => record.platform !== input.platform);
    let best: { record: IdentityRecord; verdict: MergeVerdict } | null = null;
    for (const record of others) {
      const verdict = judgeMerge(candidate, {
        platform: record.platform,
        handle: record.handle,
        displayName: record.displayName,
        email: record.email,
      });
      if (!verdict) continue;
      if (!best || verdict.confidence > best.verdict.confidence) best = { record, verdict };
    }

    if (best) {
      // The person already exists: this handle joins that person.
      const identityId = await this.insertIdentity({
        personId: best.record.personId,
        platform: input.platform,
        handle: input.handle,
        email: input.email ?? null,
        confidence: best.verdict.confidence,
        evidence: best.verdict.evidence,
      });
      return {
        identityId,
        personId: best.record.personId,
        merged: true,
        evidence: best.verdict.evidence,
      };
    }

    const identityId = await this.insertIdentity({
      personId,
      platform: input.platform,
      handle: input.handle,
      email: input.email ?? null,
      confidence: 1,
      evidence: "seen on one platform only",
    });
    return { identityId, personId, merged: false, evidence: null };
  }

  private async insertIdentity(input: {
    personId: number;
    platform: Platform;
    handle: string;
    email: string | null;
    confidence: number;
    evidence: string | null;
  }): Promise<number> {
    const result = await this.pool.query<{ id: number }>(
      `INSERT INTO identities (person_id, platform, handle, email, confidence, evidence)
            VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (platform, handle) DO UPDATE
              SET person_id = EXCLUDED.person_id,
                  email = COALESCE(EXCLUDED.email, identities.email),
                  confidence = EXCLUDED.confidence,
                  evidence = EXCLUDED.evidence
         RETURNING id`,
      [input.personId, input.platform, input.handle, input.email, input.confidence, input.evidence],
    );
    const id = result.rows[0]?.id;
    if (!id) throw new Error(`Could not save the identity ${input.platform}/${input.handle}`);
    return id;
  }

  /** The people behind the posts that a decision quotes. */
  async peopleForPosts(postIds: number[]): Promise<PersonSummary[]> {
    if (postIds.length === 0) return [];
    const result = await this.pool.query<IdentityRow>(
      `SELECT DISTINCT ON (p.id) i.*, p.display_name
         FROM posts po
         JOIN identities i
           ON i.platform = CASE WHEN po.source_id IN (SELECT id FROM sources WHERE kind = 'discourse')
                                THEN 'discourse'
                                WHEN po.source_id IN (SELECT id FROM sources WHERE kind IN ('github_issue','github_pr'))
                                THEN 'github'
                                ELSE 'unknown' END
          AND i.handle = po.author_handle
         JOIN people p ON p.id = i.person_id
        WHERE po.id = ANY($1::int[])
        ORDER BY p.id, i.confidence DESC`,
      [postIds],
    );
    const byPerson = new Map<number, PersonSummary>();
    for (const row of result.rows) {
      const record = this.toRecord(row);
      const summary = byPerson.get(record.personId) ?? {
        personId: record.personId,
        displayName: record.displayName,
        identities: [],
      };
      summary.identities.push({
        platform: record.platform,
        handle: record.handle,
        confidence: record.confidence,
        evidence: record.evidence,
      });
      byPerson.set(record.personId, summary);
    }
    return [...byPerson.values()];
  }

  /** How many identities were linked to a person that already existed. */
  async mergedCount(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT count(*) FROM identities WHERE evidence <> 'seen on one platform only'",
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export { normalizeDisplayName, normalizeHandle };
export type { IdentityCandidate, MergeVerdict, Platform };
