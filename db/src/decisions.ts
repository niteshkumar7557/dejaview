// Decisions, reasons, evidence and code anchors.
//
// Reading the contract out of packages/shared/src/api.ts, this file returns exactly the shapes
// the API promises, so the frontend never has to guess.

import type {
  CodeAnchor,
  DecisionCard,
  DecisionSummary,
  DecisionStatus,
  EvidenceView,
  ExtractedDecision,
  ExtractionResult,
  ReasonView,
  TopicRef,
} from "@dejaview/shared";
import type { Pool } from "pg";
import { withTransaction } from "./client.js";

export interface DecisionRow {
  id: number;
  topic_id: number;
  title: string;
  kind: "proposal" | "alternative";
  status: DecisionStatus;
  summary: string | null;
  confidence: "high" | "medium" | "low";
  decided_at: Date | null;
  model: string;
  decision_key: string | null;
  created_at: Date;
}

export interface SearchInput {
  q?: string;
  status?: DecisionStatus | null;
  topicSlug?: string | null;
  verifiedOnly?: boolean;
  limit?: number;
}

/** An extraction read back from the database, with the database id of every decision. */
export interface StoredExtraction {
  result: ExtractionResult;
  /** ExtractedDecision.key -> decisions.id */
  decisionIds: Map<string, number>;
}

interface DecisionSummaryRow extends DecisionRow {
  topic_slug: string;
  topic_title: string;
  topic_pep_number: number | null;
  reason_texts: string[] | null;
  verified_evidence: string;
  total_evidence: string;
}

interface AnchorRow {
  id: number;
  decision_id: number;
  repo: string;
  symbol: string | null;
  original_path: string;
  original_commit: string | null;
  current_path: string | null;
  relocated_by: "git-follow" | "symbol-search" | null;
  link_method: "pr_ref" | "path_mention" | "symbol_mention";
  evidence_post_id: number | null;
}

function toAnchor(row: AnchorRow): CodeAnchor {
  return {
    repo: row.repo,
    symbol: row.symbol,
    originalPath: row.original_path,
    originalCommit: row.original_commit,
    currentPath: row.current_path,
    relocatedBy: row.relocated_by,
    linkMethod: row.link_method,
    evidencePostId: row.evidence_post_id,
  };
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export class DecisionsRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Stores the result of an extraction run. The decisions of the topic are replaced, because a
   * re-run computes the whole topic again and old rows would only confuse the dashboard.
   */
  async saveExtraction(input: {
    topicId: number;
    result: ExtractionResult;
    postIds: Map<string, number>;
  }): Promise<number[]> {
    const { topicId, result, postIds } = input;

    await this.pool.query("DELETE FROM decisions WHERE topic_id = $1", [topicId]);

    const decisionIds: number[] = [];
    for (const decision of result.decisions) {
      const decisionId = await this.saveDecision(topicId, decision, postIds);
      decisionIds.push(decisionId);
    }
    return decisionIds;
  }

  private async saveDecision(
    topicId: number,
    decision: ExtractedDecision,
    postIds: Map<string, number>,
  ): Promise<number> {
    const inserted = await this.pool.query<{ id: number }>(
      `INSERT INTO decisions (topic_id, title, kind, status, summary, confidence, decided_at, model, decision_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
      [
        topicId,
        decision.title,
        decision.kind,
        decision.status,
        decision.summary,
        decision.confidence,
        decision.decidedAt,
        decision.model,
        decision.key,
      ],
    );
    const decisionId = inserted.rows[0]?.id;
    if (!decisionId) throw new Error(`Could not save decision "${decision.title}"`);

    const reasonTexts: string[] = [];
    for (const reason of decision.reasons) {
      const reasonResult = await this.pool.query<{ id: number }>(
        "INSERT INTO reasons (decision_id, text) VALUES ($1, $2) RETURNING id",
        [decisionId, reason.text],
      );
      const reasonId = reasonResult.rows[0]?.id;
      reasonTexts.push(reason.text);
      if (!reasonId) continue;

      for (const evidence of reason.evidence) {
        await this.pool.query(
          `INSERT INTO evidence (decision_id, reason_id, post_id, thread_post_id, quote, verified, match_score)
                VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            decisionId,
            reasonId,
            postIds.get(String(evidence.postId)) ?? null,
            evidence.postId,
            evidence.quote,
            evidence.verified,
            evidence.matchScore,
          ],
        );
      }
    }

    // The search vector holds the title, the summary and every reason, so one query can find
    // decisions by any of them.
    await this.pool.query(
      `UPDATE decisions
          SET search = to_tsvector('english', $2)
        WHERE id = $1`,
      [decisionId, [decision.title, decision.summary ?? "", ...reasonTexts].join(" ")],
    );

    return decisionId;
  }

  /**
   * Sets the code a decision is about, replacing any links saved before. The link step can run again
   * for the same decision (a retried job, or a re-link after a linker fix), and must not pile up copies.
   */
  async saveAnchors(
    decisionId: number,
    anchors: CodeAnchor[],
    postIds: Map<string, number>,
  ): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      await client.query("DELETE FROM code_anchors WHERE decision_id = $1", [decisionId]);
      for (const anchor of anchors) {
        await client.query(
          `INSERT INTO code_anchors
             (decision_id, repo, symbol, original_path, original_commit, current_path,
              relocated_by, link_method, evidence_post_id, last_checked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
          [
            decisionId,
            anchor.repo,
            anchor.symbol,
            anchor.originalPath,
            anchor.originalCommit,
            anchor.currentPath,
            anchor.relocatedBy,
            anchor.linkMethod,
            anchor.evidencePostId === null
              ? null
              : (postIds.get(String(anchor.evidencePostId)) ?? null),
          ],
        );
      }
    });
  }

  private async anchorsFor(decisionIds: number[]): Promise<Map<number, CodeAnchor[]>> {
    const byDecision = new Map<number, CodeAnchor[]>();
    if (decisionIds.length === 0) return byDecision;
    const result = await this.pool.query<AnchorRow>(
      "SELECT * FROM code_anchors WHERE decision_id = ANY($1::int[]) ORDER BY id",
      [decisionIds],
    );
    for (const row of result.rows) {
      const list = byDecision.get(row.decision_id) ?? [];
      list.push(toAnchor(row));
      byDecision.set(row.decision_id, list);
    }
    return byDecision;
  }

  private toSummary(
    row: DecisionSummaryRow,
    anchors: CodeAnchor[],
  ): DecisionSummary {
    return {
      id: row.id,
      topic: { slug: row.topic_slug, title: row.topic_title, pepNumber: row.topic_pep_number },
      title: row.title,
      status: row.status,
      confidence: row.confidence,
      reasons: row.reason_texts ?? [],
      anchors,
      verifiedEvidence: Number(row.verified_evidence),
      totalEvidence: Number(row.total_evidence),
    };
  }

  /** Full text search over the decisions, with the filters the dashboard offers. */
  async search(input: SearchInput): Promise<DecisionSummary[]> {
    const q = input.q?.trim() ?? "";
    const limit = input.limit ?? 100;

    const result = await this.pool.query<DecisionSummaryRow>(
      `SELECT d.*,
              t.slug AS topic_slug,
              t.title AS topic_title,
              t.pep_number AS topic_pep_number,
              COALESCE((SELECT array_agg(r.text ORDER BY r.id)
                          FROM reasons r WHERE r.decision_id = d.id), '{}') AS reason_texts,
              (SELECT count(*) FROM evidence e
                WHERE e.decision_id = d.id AND e.verified)::text AS verified_evidence,
              (SELECT count(*) FROM evidence e WHERE e.decision_id = d.id)::text AS total_evidence
         FROM decisions d
         JOIN topics t ON t.id = d.topic_id
        WHERE ($1 = '' OR d.search @@ plainto_tsquery('english', $1))
          AND ($2::text IS NULL OR d.status = $2)
          AND ($3::text IS NULL OR t.slug = $3)
          AND ($4 = false OR EXISTS (SELECT 1 FROM evidence e
                                       WHERE e.decision_id = d.id AND e.verified))
        ORDER BY d.id DESC
        LIMIT $5`,
      [q, input.status ?? null, input.topicSlug ?? null, input.verifiedOnly ?? false, limit],
    );

    const anchorsByDecision = await this.anchorsFor(result.rows.map((row) => row.id));
    return result.rows.map((row) => this.toSummary(row, anchorsByDecision.get(row.id) ?? []));
  }

  /** The decisions of one topic. */
  async listByTopic(topicSlug: string): Promise<DecisionSummary[]> {
    return this.search({ topicSlug, limit: 1000 });
  }

  /** Rejected decisions whose text looks like the text we are looking for. */
  /**
   * Rejected decisions that look like a proposal (the PR bot's "already rejected?" check).
   *
   * A PR's title and description are long and written in their own words, so we can't ask for every
   * word to match (plainto_tsquery joins them with AND, which a real PR never passes). Instead we count
   * the meaningful words (Postgres lexemes, stemmed, no stop words) the PR shares with each rejected
   * decision's title, summary and reasons, keep those sharing at least 3 (or every word of a shorter
   * query), and rank by how many they share.
   */
  async similarRejected(q: string, limit = 10): Promise<DecisionSummary[]> {
    const result = await this.pool.query<DecisionSummaryRow>(
      `WITH query AS (
         SELECT array(SELECT DISTINCT lexeme FROM unnest(to_tsvector('english', $1))) AS lexemes
       ),
       scored AS (
         SELECT d.id,
                cardinality(array(
                  SELECT unnest(tsvector_to_array(d.search))
                  INTERSECT
                  SELECT unnest(query.lexemes)
                )) AS shared
           FROM decisions d, query
          WHERE d.status = 'rejected' AND d.search IS NOT NULL
       )
       SELECT d.*,
              t.slug AS topic_slug,
              t.title AS topic_title,
              t.pep_number AS topic_pep_number,
              COALESCE((SELECT array_agg(r.text ORDER BY r.id)
                          FROM reasons r WHERE r.decision_id = d.id), '{}') AS reason_texts,
              (SELECT count(*) FROM evidence e
                WHERE e.decision_id = d.id AND e.verified)::text AS verified_evidence,
              (SELECT count(*) FROM evidence e WHERE e.decision_id = d.id)::text AS total_evidence
         FROM scored s
         JOIN decisions d ON d.id = s.id
         JOIN topics t ON t.id = d.topic_id
        WHERE s.shared > 0
          AND s.shared >= LEAST(3, (SELECT cardinality(lexemes) FROM query))
        ORDER BY s.shared DESC, d.id DESC
        LIMIT $2`,
      [q, limit],
    );
    const anchorsByDecision = await this.anchorsFor(result.rows.map((row) => row.id));
    return result.rows.map((row) => this.toSummary(row, anchorsByDecision.get(row.id) ?? []));
  }

  /** The database id of the decision the pipeline called "d1" and friends. */
  async idByKey(topicId: number, key: string): Promise<number | null> {
    const result = await this.pool.query<{ id: number }>(
      "SELECT id FROM decisions WHERE topic_id = $1 AND decision_key = $2 LIMIT 1",
      [topicId, key],
    );
    return result.rows[0]?.id ?? null;
  }

  /** Reads an extraction result back out of the database. */
  async loadExtraction(topicId: number): Promise<StoredExtraction | null> {
    const decisionsResult = await this.pool.query<DecisionRow>(
      "SELECT * FROM decisions WHERE topic_id = $1 ORDER BY id",
      [topicId],
    );
    if (decisionsResult.rows.length === 0) return null;

    const topicResult = await this.pool.query<{ slug: string }>(
      "SELECT slug FROM topics WHERE id = $1",
      [topicId],
    );
    const topicSlug = topicResult.rows[0]?.slug;
    if (!topicSlug) return null;

    const reasonsResult = await this.pool.query<{ id: number; decision_id: number; text: string }>(
      "SELECT id, decision_id, text FROM reasons WHERE decision_id = ANY($1::int[]) ORDER BY id",
      [decisionsResult.rows.map((row) => row.id)],
    );
    const evidenceResult = await this.pool.query<{
      id: number;
      decision_id: number;
      reason_id: number;
      thread_post_id: number | null;
      quote: string;
      verified: boolean;
      match_score: number;
    }>(
      `SELECT id, decision_id, reason_id, thread_post_id, quote, verified, match_score
         FROM evidence WHERE decision_id = ANY($1::int[]) ORDER BY id`,
      [decisionsResult.rows.map((row) => row.id)],
    );

    const reasonsByDecision = new Map<number, { id: number; text: string }[]>();
    for (const reason of reasonsResult.rows) {
      const list = reasonsByDecision.get(reason.decision_id) ?? [];
      list.push({ id: reason.id, text: reason.text });
      reasonsByDecision.set(reason.decision_id, list);
    }

    const evidenceByReason = new Map<
      number,
      { postId: number; quote: string; verified: boolean; matchScore: number }[]
    >();
    for (const evidence of evidenceResult.rows) {
      const list = evidenceByReason.get(evidence.reason_id) ?? [];
      list.push({
        postId: evidence.thread_post_id ?? 0,
        quote: evidence.quote,
        verified: evidence.verified,
        matchScore: evidence.match_score,
      });
      evidenceByReason.set(evidence.reason_id, list);
    }

    const decisions: ExtractedDecision[] = decisionsResult.rows.map((row) => ({
      key: row.decision_key ?? `d${row.id}`,
      title: row.title,
      kind: row.kind,
      status: row.status,
      summary: row.summary ?? "",
      confidence: row.confidence,
      decidedAt: toIso(row.decided_at),
      model: row.model,
      reasons: (reasonsByDecision.get(row.id) ?? []).map((reason) => ({
        text: reason.text,
        evidence: evidenceByReason.get(reason.id) ?? [],
      })),
    }));

    const decisionIds = new Map<string, number>();
    for (const row of decisionsResult.rows) {
      decisionIds.set(row.decision_key ?? `d${row.id}`, row.id);
    }

    return {
      result: {
        topicSlug,
        models: { triage: "qwen3.5:4b", extract: "qwen3.5:9b" },
        posts: [],
        decisions,
      },
      decisionIds,
    };
  }

  /** Everything a decision card shows. */
  async getCard(id: number): Promise<DecisionCard | null> {
    const result = await this.pool.query<DecisionSummaryRow>(
      `SELECT d.*,
              t.slug AS topic_slug,
              t.title AS topic_title,
              t.pep_number AS topic_pep_number,
              COALESCE((SELECT array_agg(r.text ORDER BY r.id)
                          FROM reasons r WHERE r.decision_id = d.id), '{}') AS reason_texts,
              (SELECT count(*) FROM evidence e
                WHERE e.decision_id = d.id AND e.verified)::text AS verified_evidence,
              (SELECT count(*) FROM evidence e WHERE e.decision_id = d.id)::text AS total_evidence
         FROM decisions d
         JOIN topics t ON t.id = d.topic_id
        WHERE d.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;

    const reasonsResult = await this.pool.query<{
      id: number;
      text: string;
    }>("SELECT id, text FROM reasons WHERE decision_id = $1 ORDER BY id", [id]);

    const evidenceResult = await this.pool.query<EvidenceRow>(
      `SELECT e.id, e.decision_id, e.reason_id, e.post_id, e.quote, e.verified, e.match_score,
              p.author_handle, p.created_at AS post_created_at, p.url AS post_url
         FROM evidence e
         LEFT JOIN posts p ON p.id = e.post_id
        WHERE e.decision_id = $1
        ORDER BY e.id`,
      [id],
    );

    const evidenceByReason = new Map<number, EvidenceView[]>();
    for (const evidence of evidenceResult.rows) {
      const list = evidenceByReason.get(evidence.reason_id) ?? [];
      const view: EvidenceView = {
        id: evidence.id,
        postId: evidence.post_id ?? 0,
        quote: evidence.quote,
        verified: evidence.verified,
        matchScore: evidence.match_score,
        author: evidence.author_handle ?? "unknown",
        createdAt: toIso(evidence.post_created_at),
        postUrl: evidence.post_url,
      };
      list.push(view);
      evidenceByReason.set(evidence.reason_id, list);
    }

    const reasons: ReasonView[] = reasonsResult.rows.map((reason) => ({
      id: reason.id,
      text: reason.text,
      evidence: evidenceByReason.get(reason.id) ?? [],
    }));

    const anchorsByDecision = await this.anchorsFor([id]);
    const people = [
      ...new Set(
        evidenceResult.rows
          .map((evidence) => evidence.author_handle)
          .filter((author): author is string => Boolean(author)),
      ),
    ];

    const topic: TopicRef = {
      slug: row.topic_slug,
      title: row.topic_title,
      pepNumber: row.topic_pep_number,
    };

    return {
      id: row.id,
      topic,
      title: row.title,
      kind: row.kind,
      status: row.status,
      summary: row.summary ?? "",
      confidence: row.confidence,
      decidedAt: toIso(row.decided_at),
      model: row.model,
      reasons,
      anchors: anchorsByDecision.get(id) ?? [],
      people,
    };
  }
}

interface EvidenceRow {
  id: number;
  decision_id: number;
  reason_id: number;
  post_id: number | null;
  quote: string;
  verified: boolean;
  match_score: number;
  author_handle: string | null;
  post_created_at: Date | null;
  post_url: string | null;
}
