import type { JobView } from "@dejaview/shared";

/** The pipeline's stages in order, in the words shown to a maintainer. */
export const PIPELINE_STAGES = [
  { name: "ingest", label: "Fetching posts" },
  { name: "clean", label: "Removing quotes, thanks and +1s" },
  { name: "triage", label: "Sorting posts with qwen3.5:4b" },
  { name: "extract", label: "Extracting decisions with qwen3.5:9b" },
  { name: "verify", label: "Checking every quote against its post" },
  { name: "consolidate", label: "Merging duplicate ideas with qwen3.5:9b" },
  { name: "link", label: "Linking decisions to CPython code" },
] as const;

export type StageState = "done" | "running" | "failed" | "pending";

/**
 * Which row of PIPELINE_STAGES a job is on. The pipeline reports its own stage names (clean … consolidate),
 * but the worker also writes names of its own ("fetching", "storing", "queued", "linking", "done"), and the
 * same word can mean different rows: an ingest job's "storing" is the fetch step, an extract job's
 * "storing" comes after consolidate. So unknown names are placed by the job's type.
 */
export function stageIndex(job: Pick<JobView, "type" | "stage">): number {
  const byName = PIPELINE_STAGES.findIndex((s) => s.name === job.stage);
  if (byName >= 0) return byName;
  switch (job.type) {
    case "ingest": return 0;
    case "extract": return job.stage === "storing" || job.stage === "done" ? 5 : 1;
    case "link": return 6;
    default: return -1;
  }
}

export function stageRows(job: JobView | null): { name: string; label: string; state: StageState }[] {
  const current = job ? stageIndex(job) : -1;
  return PIPELINE_STAGES.map((s, i) => {
    let state: StageState = "pending";
    if (job && (i < current || (i === current && job.status === "done"))) state = "done";
    else if (job && i === current && job.status !== "queued") state = job.status === "failed" ? "failed" : "running";
    return { name: s.name, label: s.label, state };
  });
}

/**
 * How far the whole chain is, 0..1. The worker's `progress` is per job (and per stage inside the
 * extract job), so a finished ingest job says 1 while six of the seven steps are still ahead.
 * Each row counts as one equal share; the job's own progress fills the current row.
 */
export function overallProgress(job: JobView): number {
  if (job.type === "eval") return job.progress;
  const current = stageIndex(job);
  if (current < 0) return 0;
  if (job.status === "done" && current === PIPELINE_STAGES.length - 1) return 1;
  const withinRow = job.status === "done" ? 1 : Math.min(Math.max(job.progress, 0), 1);
  return (current + withinRow) / PIPELINE_STAGES.length;
}

/** A job as the follower sees it: the worker chains ingest → extract → link, each a separate job. */
export type JobWithNext = JobView & { nextJobId?: number | null };

/**
 * Where a job leaves the user:
 * - "running" / "failed": as it says.
 * - "finished": the last job of the chain is done (link, or an eval job).
 * - "handed-off": this job is done but the worker queued the next step as a new job we cannot see,
 *   because the API does not say which job comes next. The topic page fills in once that finishes.
 */
export type JobOutcome = "running" | "failed" | "finished" | "handed-off";

export function jobOutcome(job: JobView): JobOutcome {
  if (job.status === "failed") return "failed";
  if (job.status !== "done") return "running";
  return job.type === "link" || job.type === "eval" ? "finished" : "handed-off";
}

/** The id to poll after this job, if the API names one and this job is done. */
export function nextJobToFollow(job: JobWithNext): number | null {
  return job.status === "done" && typeof job.nextJobId === "number" ? job.nextJobId : null;
}

/**
 * The ingest page keeps the job it follows in its URL (`?job=21&topic=attrs-445`), so a refresh or a
 * shared link picks the job up again instead of forgetting it. The topic only exists once the worker
 * has fetched the thread, so without this a queued job would be invisible everywhere.
 */
export function followedJobQuery(jobId: number, topicSlug: string | null): string {
  const params = new URLSearchParams({ job: String(jobId) });
  if (topicSlug) params.set("topic", topicSlug);
  return `?${params.toString()}`;
}

export function followedJobFromQuery(search: string): { jobId: number; topicSlug: string | null } | null {
  const params = new URLSearchParams(search);
  const raw = params.get("job") ?? "";
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) return null;
  return { jobId: Number(raw), topicSlug: params.get("topic") || null };
}

/** File types the API's upload reader understands (packages/ingest/src/upload.ts). */
export const UPLOAD_ACCEPT = ".json,.md,.markdown,.txt";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateUpload(file: { name: string; size: number } | null): string | null {
  if (!file) return "Choose a file to upload.";
  if (!/\.(json|md|markdown|txt)$/i.test(file.name)) return "Upload a .json, .md or .txt file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "That file is larger than 5 MB.";
  return null;
}

export function validateIngestUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return "Paste a full link starting with https://";
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host !== "discuss.python.org" && host !== "github.com") {
    return "Use a discuss.python.org thread or a github.com issue or pull request.";
  }
  return null;
}

/** A topic slug (and PEP number) guessed from the link, so the form fills itself. */
export function suggestSlug(input: string): { slug: string; pep: number | null } | null {
  const pep = /\bpep[-_ ]?(\d{1,4})\b/i.exec(input);
  if (pep) return { slug: `pep-${Number(pep[1])}`, pep: Number(pep[1]) };
  const gh = /github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/(\d+)/.exec(input);
  if (gh) return { slug: `gh-${gh[1]}`, pep: null };
  return null;
}
