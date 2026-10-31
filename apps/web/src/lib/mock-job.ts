import type { JobView } from "@dejaview/shared";

/** Stage names and how long each takes in the simulated job (ms). Total 38 s. */
export const MOCK_STAGES = [
  ["ingest", 4000],
  ["clean", 2000],
  ["triage", 9000],
  ["extract", 12000],
  ["verify", 2000],
  ["consolidate", 5000],
  ["link", 4000],
] as const;

export type MockStage = (typeof MOCK_STAGES)[number][0];

const TOTAL = MOCK_STAGES.reduce((sum, [, ms]) => sum + ms, 0);

/** The simulated job as it looks `elapsedMs` after it started. */
export function mockJobAt(elapsedMs: number, id = 1, startedAt = 0): JobView {
  const clamped = Math.min(Math.max(elapsedMs, 0), TOTAL);
  let acc = 0;
  let stage: MockStage = MOCK_STAGES[MOCK_STAGES.length - 1]![0];
  for (const [name, ms] of MOCK_STAGES) {
    if (clamped < acc + ms) {
      stage = name;
      break;
    }
    acc += ms;
  }
  const done = clamped >= TOTAL;
  return {
    id,
    type: "ingest",
    status: done ? "done" : "running",
    stage,
    progress: done ? 1 : clamped / TOTAL,
    error: null,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + clamped).toISOString(),
  };
}
