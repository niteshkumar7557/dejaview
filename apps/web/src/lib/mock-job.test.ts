import { describe, expect, it } from "vitest";
import { MOCK_STAGES, mockJobAt } from "./mock-job";

const total = MOCK_STAGES.reduce((sum, [, ms]) => sum + ms, 0);

describe("mockJobAt", () => {
  it("starts running at the first stage", () => {
    const job = mockJobAt(0);
    expect(job.status).toBe("running");
    expect(job.stage).toBe("ingest");
    expect(job.progress).toBe(0);
  });
  it("is in the clean stage after five seconds", () => expect(mockJobAt(5000).stage).toBe("clean"));
  it("progresses steadily", () => {
    const values = [0, 10000, 20000, 30000].map((t) => mockJobAt(t).progress);
    for (let i = 1; i < values.length; i++) expect(values[i]!).toBeGreaterThan(values[i - 1]!);
  });
  it("finishes after all stages", () => {
    expect(total).toBe(38000);
    const job = mockJobAt(total);
    expect(job.status).toBe("done");
    expect(job.progress).toBe(1);
  });
});
