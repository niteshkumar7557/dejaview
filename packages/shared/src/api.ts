// HTTP contract of the Express API (Mudit builds it; Nitesh's web app and Ansh's GitHub Action call it).
// Every response type lives here so the frontend can be built against mocks before the API exists.

import type {
  CodeAnchor,
  Confidence,
  DecisionKind,
  DecisionStatus,
  Evidence,
  EvalResult,
  PrCheckRequest,
  SourceKind,
  TriageLabel,
} from "./domain.js";

/**
 * Routes. All responses are JSON. Errors: non-2xx status with `ApiError`.
 *
 * POST /api/ingest                    IngestRequest (JSON) or multipart (file + fields) → IngestResponse
 * GET  /api/jobs/:id                  → JobView
 * GET  /api/topics                    → TopicSummary[]
 * GET  /api/topics/:slug              → TopicDetail
 * GET  /api/topics/:slug/timeline     → TimelinePost[]
 * GET  /api/decisions                 ?q=&status=&topic=&verified=true → DecisionSummary[]
 * GET  /api/decisions/:id             → DecisionCard
 * GET  /api/decisions/:id/llm-calls   → LlmCallView[]
 * POST /api/eval/:slug                → IngestResponse (job that runs the eval)
 * GET  /api/eval                      → EvalRunView[]
 * POST /api/pr-check                  PrCheckRequest, header `Authorization: Bearer <DEJAVIEW_API_TOKEN>` → PrCheckResponse
 * GET  /api/pr-checks                 → PrCheckView[]
 * GET  /api/health                    → HealthResponse
 *
 * MADR export is rendered in the web app from DecisionCard (no API route).
 */

export interface ApiError {
  error: string;
}

export interface TopicRef {
  slug: string;
  title: string;
  pepNumber: number | null;
}

export interface TopicSummary extends TopicRef {
  decisionCount: number;
  rejectedCount: number;
  sourceCount: number;
  /** Latest eval recall (0..1), or null if never evaluated. */
  lastRecall: number | null;
}

export interface SourceView {
  kind: SourceKind;
  url: string | null;
  title: string | null;
}

export interface DecisionSummary {
  id: number;
  topic: TopicRef;
  title: string;
  status: DecisionStatus;
  confidence: Confidence;
  reasons: string[];
  anchors: CodeAnchor[];
  /** Number of evidence quotes that passed verification / total. */
  verifiedEvidence: number;
  totalEvidence: number;
}

export interface TopicDetail extends TopicSummary {
  sources: SourceView[];
  decisions: DecisionSummary[];
}

export interface TimelinePost {
  id: number;
  author: string;
  createdAt: string | null;
  url: string | null;
  bodyClean: string;
  signalScore: number | null;
  triageLabel: TriageLabel | null;
  skipped: boolean;
  /** Decisions that cite this post as evidence. */
  decisionIds: number[];
}

export interface EvidenceView extends Evidence {
  id: number;
  author: string;
  createdAt: string | null;
  postUrl: string | null;
}

export interface ReasonView {
  id: number;
  text: string;
  evidence: EvidenceView[];
}

export interface DecisionCard {
  id: number;
  topic: TopicRef;
  title: string;
  kind: DecisionKind;
  status: DecisionStatus;
  summary: string;
  confidence: Confidence;
  decidedAt: string | null;
  model: string;
  reasons: ReasonView[];
  anchors: CodeAnchor[];
  /** Authors of the evidence posts. */
  people: string[];
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

export type JobType = "ingest" | "extract" | "link" | "eval";
export type JobStatus = "queued" | "running" | "done" | "failed";

export interface JobView {
  id: number;
  type: JobType;
  status: JobStatus;
  stage: string | null;
  /** 0..1 */
  progress: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IngestRequest {
  url: string;
  topicSlug: string;
  topicTitle?: string;
  pepNumber?: number;
}

export interface IngestResponse {
  jobId: number;
  topicSlug: string;
}

export interface EvalRunView extends EvalResult {
  id: number;
  topic: TopicRef;
  createdAt: string;
}

export interface PrCheckResponse {
  /** Decisions whose code anchors this PR touches. */
  decisions: DecisionSummary[];
  /** Rejected decisions similar to the PR's title/body ("already rejected?"). */
  similarRejected: DecisionSummary[];
  /** The exact comment the Action posts. */
  commentMarkdown: string;
}

export interface PrCheckView {
  id: number;
  request: Pick<PrCheckRequest, "repo" | "prNumber" | "title">;
  decisionIds: number[];
  similarRejectedIds: number[];
  commentMarkdown: string;
  createdAt: string;
}

export interface HealthResponse {
  ok: boolean;
  db: boolean;
  llm: boolean;
}
