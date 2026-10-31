import { describe, expect, it } from "vitest";
import { overallProgress } from "./ingest";
import { MOCK_EVAL_MS, MOCK_STAGES, mockEvalJobAt, mockJobAt } from "./mock-job";

const total = MOCK_STAGES.reduce((sum, [, ms]) => sum + ms, 0);

describe("mockJobAt", () => {
  it("starts running at the first stage", () => {
    const job = mockJobAt(0);
    expect(job.status).toBe("running");
    expect(job.stage).toBe("ingest");
    expect(job.progress).toBe(0);
  });
  it("is in the clean stage after five seconds", () => expect(mockJobAt(5000).stage).toBe("clean"));
  it("progresses steadily across the chain", () => {
    const values = [0, 10000, 20000, 30000].map((t) => overallProgress(mockJobAt(t)));
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
  });
  it("finishes after all stages", () => {
    expect(total).toBe(38000);
    const job = mockJobAt(total);
    expect(job.status).toBe("done");
    expect(job.progress).toBe(1);
  });
  it("reports the job type of each step, like the worker's chain", () => {
    expect(mockJobAt(0).type).toBe("ingest");
    expect(mockJobAt(5000).type).toBe("extract");
    expect(mockJobAt(total).type).toBe("link");
  });
});

describe("mockEvalJobAt", () => {
  it("runs, then finishes as an eval job", () => {
    expect(mockEvalJobAt(0)).toMatchObject({ type: "eval", status: "running", progress: 0 });
    expect(mockEvalJobAt(MOCK_EVAL_MS)).toMatchObject({ type: "eval", status: "done", progress: 1 });
  });
});
