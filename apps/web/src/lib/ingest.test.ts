import type { JobView } from "@dejaview/shared";
import { describe, expect, it } from "vitest";
import { stageRows, suggestSlug, validateIngestUrl } from "./ingest";

const job = (status: JobView["status"], stage: string | null, progress: number): JobView => ({
  id: 1, type: "ingest", status, stage, progress, error: null, createdAt: "", updatedAt: "",
});

describe("stageRows", () => {
  it("marks earlier stages done, the current one running and later ones pending", () => {
    const rows = stageRows(job("running", "extract", 0.5));
    expect(rows.map((r) => r.state)).toEqual(["done", "done", "done", "running", "pending", "pending", "pending"]);
    expect(rows[3]!.label).toBe("Extracting decisions with qwen3.5:9b");
  });
  it("marks every stage done when the job is done", () => {
    expect(stageRows(job("done", "link", 1)).every((r) => r.state === "done")).toBe(true);
  });
  it("marks the stage that failed", () => {
    expect(stageRows(job("failed", "triage", 0.3)).map((r) => r.state)).toEqual(["done", "done", "failed", "pending", "pending", "pending", "pending"]);
  });
  it("shows everything pending before a job exists", () => {
    expect(stageRows(null).every((r) => r.state === "pending")).toBe(true);
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
