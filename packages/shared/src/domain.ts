// Shared contract between the four parts of DejaView (see docs/team/README.md).
// These are the shapes each part hands to another part. Change them only through a PR
// that every owner has seen: a change here can break someone else's code.

// ───────────── Ingest (Mudit) → Pipeline (Abhijeet) and Linker (Ansh) ─────────────

export type SourceKind = "discourse" | "github_issue" | "github_pr" | "upload";

/** How `ThreadPost.body` is encoded, so the pipeline's cleaner knows how to strip quotes. */
export type BodyFormat = "html" | "markdown" | "text";

/** One post or comment in a discussion, as fetched. */
export interface ThreadPost {
  /** Stable id inside the thread. In fixtures: the post number. In the DB: posts.id. */
  id: number;
  /** Discourse post number or GitHub comment id. */
  externalId: string;
  /** Platform handle of the author. */
  author: string;
  /** ISO 8601 timestamp, or null when unknown. */
  createdAt: string | null;
  /** Permalink to this exact post, used as the evidence link. */
  url: string | null;
  /** Body exactly as fetched (Discourse "cooked" HTML, GitHub Markdown, or plain text). */
  body: string;
  format: BodyFormat;
  likes?: number;
  /** Id of the post this one replies to, when the platform says so. */
  replyToId?: number | null;
}

/** A whole discussion: what ingest writes to fixtures/threads/<slug>.json and what the pipeline reads. */
export interface Thread {
  topic: { slug: string; title: string; pepNumber: number | null };
  source: { kind: SourceKind; url: string | null; title: string; externalId: string | null };
  posts: ThreadPost[];
}

// ───────────── Pipeline (Abhijeet) → Worker/DB (Mudit), Linker (Ansh), Web (Nitesh) ─────────────

export const TRIAGE_LABELS = [
  "proposal",
  "alternative",
  "objection",
  "support",
  "decision",
  "question",
  "noise",
] as const;
export type TriageLabel = (typeof TRIAGE_LABELS)[number];

export const DECISION_STATUSES = ["accepted", "rejected", "withdrawn", "open"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export type DecisionKind = "proposal" | "alternative";
export type Confidence = "high" | "medium" | "low";

export type PipelineStage = "clean" | "triage" | "extract" | "verify" | "consolidate";

/** What the pipeline learned about each post (shown in the dashboard timeline). */
export interface PostAnnotation {
  postId: number;
  bodyClean: string;
  signalScore: number;
  triageLabel: TriageLabel | null;
  /** True when the post was filtered out before the LLM stages. */
  skipped: boolean;
}

/** A verbatim quote backing a reason, checked against the original post. */
export interface Evidence {
  postId: number;
  quote: string;
  verified: boolean;
  /** 1.0 = exact match; below the threshold means unverified. */
  matchScore: number;
}

export interface Reason {
  text: string;
  evidence: Evidence[];
}

export interface ExtractedDecision {
  /** Unique within one extraction run (e.g. "d1"); lets eval and linker refer to a decision before it has a DB id. */
  key: string;
  title: string;
  kind: DecisionKind;
  status: DecisionStatus;
  summary: string;
  confidence: Confidence;
  decidedAt: string | null;
  /** Model that produced the final record, e.g. "qwen3.5:9b". */
  model: string;
  reasons: Reason[];
}

export interface ExtractionResult {
  topicSlug: string;
  models: { triage: string; extract: string };
  posts: PostAnnotation[];
  decisions: ExtractedDecision[];
}

/** One LLM call, stored for the audit trail and reused as a cache (DB table llm_calls). */
export interface LlmCallRecord {
  promptHash: string;
  model: string;
  stage: PipelineStage | "eval";
  prompt: string;
  response: unknown;
  durationMs: number;
}

/** Storage the pipeline uses for LLM calls. Mudit implements it with Postgres; tests use memory/files. */
export interface LlmCallStore {
  get(promptHash: string): Promise<LlmCallRecord | null>;
  save(record: LlmCallRecord): Promise<void>;
}

export type ProgressReporter = (stage: PipelineStage, done: number, total: number) => void;

// ───────────── Eval (Abhijeet) ─────────────

/** One item from the real PEP's "Rejected Ideas" section. */
export interface GroundTruthItem {
  title: string;
  text: string;
}

export type ReasonAgreement = "yes" | "partial" | "no";

export interface EvalMatch {
  groundTruth: GroundTruthItem;
  /** ExtractedDecision.key of the matching decision, or null when we missed it. */
  decisionKey: string | null;
  /**
   * The database id of the matching decision, so the scorecard can link to the card itself.
   * The key is what the pipeline knows ("d1"); this is what a reader can click.
   * Optional, so existing EvalMatch values keep typechecking.
   */
  decisionId?: number | null;
  reasonAgreement: ReasonAgreement | null;
}

export interface EvalResult {
  pepNumber: number;
  groundTruth: GroundTruthItem[];
  matches: EvalMatch[];
  /** Share of ground-truth rejected ideas we recovered, 0..1. */
  recall: number;
  /** Share of recovered ideas whose reasons agree with the PEP, 0..1. */
  reasonAgreement: number;
  /** Rejected ideas we found that the PEP does not list (shown, not counted as wrong). */
  extraIdeas: number;
}

// ───────────── Linker (Ansh) → Worker/DB (Mudit), API, Web ─────────────

export type LinkMethod = "pr_ref" | "path_mention" | "symbol_mention";
export type RelocatedBy = "git-follow" | "symbol-search";

/** Where in the code a decision applies. Anchored by symbol + path + commit, never by line numbers. */
export interface CodeAnchor {
  /** e.g. "python/cpython" */
  repo: string;
  symbol: string | null;
  originalPath: string;
  originalCommit: string | null;
  /** Path at HEAD after following renames; null if it could not be found. */
  currentPath: string | null;
  relocatedBy: RelocatedBy | null;
  linkMethod: LinkMethod;
  /** Post where the reference was found. */
  evidencePostId: number | null;
}

// ───────────── PR bot: Action (Ansh) → API (Mudit) → Linker (Ansh) ─────────────

export interface PrChangedFile {
  path: string;
  /** Set when the PR renames the file. */
  previousPath: string | null;
}

export interface PrCheckRequest {
  repo: string;
  prNumber: number;
  title: string;
  body: string;
  files: PrChangedFile[];
  /** Function/class names from the diff hunk headers. */
  symbols: string[];
}
