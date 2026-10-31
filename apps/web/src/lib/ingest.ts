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

export function stageRows(job: JobView | null): { name: string; label: string; state: StageState }[] {
  const current = job ? PIPELINE_STAGES.findIndex((s) => s.name === job.stage) : -1;
  return PIPELINE_STAGES.map((s, i) => {
    let state: StageState = "pending";
    if (job?.status === "done") state = "done";
    else if (job && i < current) state = "done";
    else if (job && i === current) state = job.status === "failed" ? "failed" : "running";
    return { name: s.name, label: s.label, state };
  });
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
