import type {
  DecisionCard,
  DecisionStatus,
  DecisionSummary,
  EvalRunView,
  IngestRequest,
  IngestResponse,
  JobView,
  LlmCallView,
  PrCheckView,
  TimelinePost,
  TopicDetail,
  TopicSummary,
} from "@dejaview/shared";

export interface DecisionQuery {
  q?: string;
  status?: DecisionStatus;
  topic?: string;
  verified?: boolean;
}

/** Everything the web app reads. The mock source and the HTTP source both implement it. */
export interface DataSource {
  listTopics(): Promise<TopicSummary[]>;
  getTopic(slug: string): Promise<TopicDetail | null>;
  getTimeline(slug: string): Promise<TimelinePost[] | null>;
  searchDecisions(query: DecisionQuery): Promise<DecisionSummary[]>;
  getDecision(id: number): Promise<DecisionCard | null>;
  getLlmCalls(id: number): Promise<LlmCallView[]>;
  listEvalRuns(): Promise<EvalRunView[]>;
  listPrChecks(): Promise<PrCheckView[]>;
  getJob(id: number): Promise<JobView | null>;
  startIngest(request: IngestRequest): Promise<IngestResponse>;
  /** Multipart ingest: a `file` field plus `topicSlug`, and optionally `topicTitle` and `pepNumber`. */
  startIngestUpload(form: FormData): Promise<IngestResponse>;
  /** Queues an evaluation of one topic against its PEP's Rejected Ideas. */
  startEval(slug: string): Promise<IngestResponse>;
}
