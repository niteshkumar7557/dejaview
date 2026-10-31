import type { JobView } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { jobOutcome, nextJobToFollow, overallProgress, stageIndex, stageRows, suggestSlug, validateIngestUrl, validateUpload } from "./ingest";

const job = (status: JobView["status"], stage: string | null, progress: number, type: JobView["type"] = "extract"): JobView => ({
  id: 1, type, status, stage, progress, error: null, createdAt: "", updatedAt: "",
});
const states = (j: JobView) => stageRows(j).map((r) => r.state);

describe("stageRows", () => {
  it("marks earlier stages done, the current one running and later ones pending", () => {
    const rows = stageRows(job("running", "extract", 0.5));
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "done", "running", "pending", "pending", "pending"]);
    expect(rows[3]!.label).toBe("Extracting decisions with qwen3.5:9b");
  });
  it("marks every stage done when the link job is done", () => {
    expect(stageRows(job("done", "link", 1, "link")).every((r) => r.state === "done")).toBe(true);
    expect(stageRows(job("done", "done", 1, "link")).every((r) => r.state === "done")).toBe(true);
  });
  it("marks the stage that failed", () => {
    expect(stageRows(job("failed", "triage", 0.3)).map((r) => r.state)).toEqual(["done", "done", "failed", "pending", "pending", "pending", "pending"]);
  });
  it("shows everything pending before a job exists", () => {
    expect(stageRows(null).every((r) => r.state === "pending")).toBe(true);
  });
});

describe("stageIndex with the worker's own stage names", () => {
  it("puts every ingest job stage on the fetch row", () => {
    for (const stage of ["fetching", "storing", "queued", "done", null]) {
      expect(stageIndex({ type: "ingest", stage })).toBe(0);
    }
  });
  it("puts an extract job's storing step after consolidate, and a fresh one on clean", () => {
    expect(stageIndex({ type: "extract", stage: "storing" })).toBe(5);
    expect(stageIndex({ type: "extract", stage: null })).toBe(1);
  });
  it("puts linking on the link row", () => expect(stageIndex({ type: "link", stage: "linking" })).toBe(6));
  it("shows a finished ingest job as only the fetch step done", () => {
    expect(states(job("done", "done", 1, "ingest"))).toEqual(["done", "pending", "pending", "pending", "pending", "pending", "pending"]);
  });
  it("shows a running ingest job on the fetch row", () => {
    expect(states(job("running", "fetching", 0, "ingest"))[0]).toBe("running");
  });
});

describe("jobOutcome", () => {
  it("says an ingest or extract job hands off to the next job when it is done", () => {
    expect(jobOutcome(job("done", "done", 1, "ingest"))).toBe("handed-off");
    expect(jobOutcome(job("done", "done", 1, "extract"))).toBe("handed-off");
  });
  it("says the chain is finished when a link or eval job is done", () => {
    expect(jobOutcome(job("done", "done", 1, "link"))).toBe("finished");
    expect(jobOutcome(job("done", "done", 1, "eval"))).toBe("finished");
  });
  it("passes running and failed through", () => {
    expect(jobOutcome(job("queued", null, 0))).toBe("running");
    expect(jobOutcome(job("failed", "triage", 0.3))).toBe("failed");
  });
});

describe("overallProgress", () => {
  it("counts a finished ingest job as one step of seven, not 100%", () => {
    expect(overallProgress(job("done", "done", 1, "ingest"))).toBeCloseTo(1 / 7);
  });
  it("fills the current step with the job's own progress", () => {
    expect(overallProgress(job("running", "extract", 0.5))).toBeCloseTo(3.5 / 7);
  });
  it("is 1 when the link job is done and passes eval progress through", () => {
    expect(overallProgress(job("done", "done", 1, "link"))).toBe(1);
    expect(overallProgress(job("running", null, 0.4, "eval"))).toBe(0.4);
  });
});

describe("nextJobToFollow", () => {
  it("follows nextJobId only once the job is done", () => {
    expect(nextJobToFollow({ ...job("done", "done", 1, "ingest"), nextJobId: 9 })).toBe(9);
    expect(nextJobToFollow({ ...job("running", "fetching", 0, "ingest"), nextJobId: 9 })).toBeNull();
    expect(nextJobToFollow(job("done", "done", 1, "ingest"))).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts the formats the API reads", () => {
    for (const name of ["t.json", "t.md", "t.markdown", "T.TXT"]) expect(validateUpload({ name, size: 10 })).toBeNull();
  });
  it("rejects a missing, wrong, empty or too large file", () => {
    expect(validateUpload(null)).toBe("Choose a file to upload.");
    expect(validateUpload({ name: "t.pdf", size: 10 })).toBe("Upload a .json, .md or .txt file.");
    expect(validateUpload({ name: "t.json", size: 0 })).toBe("That file is empty.");
    expect(validateUpload({ name: "t.json", size: 6 * 1024 * 1024 })).toBe("That file is larger than 5 MB.");
  });
});

describe("validateIngestUrl", () => {
  it("accepts discuss.python.org and GitHub links", () => {
    expect(validateIngestUrl("https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046")).toBeNull();
    expect(validateIngestUrl("https://github.com/python/cpython/issues/102856")).toBeNull();
  });
  it("rejects other hosts", () => {
    expect(validateIngestUrl("https://gitlab.com/python/cpython/-/issues/1")).toBe("Use a discuss.python.org thread or a github.com issue or pull request.");
  });
  it("rejects text that is not a URL", () => {
    expect(validateIngestUrl("pep 701")).toBe("Paste a full link starting with https://");
  });
});

describe("suggestSlug", () => {
  it("finds the PEP number in a thread URL", () => {
    expect(suggestSlug("https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046")).toEqual({ slug: "pep-701", pep: 701 });
  });
  it("falls back to the issue number for GitHub", () => {
    expect(suggestSlug("https://github.com/python/cpython/issues/102856")).toEqual({ slug: "gh-102856", pep: null });
  });
  it("returns nothing for an unrecognised URL", () => expect(suggestSlug("https://discuss.python.org/t/ideas/1")).toBeNull());
});
