import type { JobType, JobView } from "@dejaview/shared";

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

/** The real worker runs each step as its own job type; the simulation follows the same chain. */
function typeOf(stage: MockStage): JobType {
  if (stage === "ingest") return "ingest";
  if (stage === "link") return "link";
  return "extract";
}

/** The simulated job as it looks `elapsedMs` after it started. */
export function mockJobAt(elapsedMs: number, id = 1, startedAt = 0): JobView {
  const clamped = Math.min(Math.max(elapsedMs, 0), TOTAL);
  let acc = 0;
  let stage: MockStage = MOCK_STAGES[MOCK_STAGES.length - 1]![0];
  let withinStage = 1;
  for (const [name, ms] of MOCK_STAGES) {
    if (clamped < acc + ms) {
      stage = name;
      withinStage = (clamped - acc) / ms;
      break;
    }
    acc += ms;
  }
  const done = clamped >= TOTAL;
  return {
    id,
    type: typeOf(stage),
    status: done ? "done" : "running",
    stage,
    // Like the real worker: progress is within the current step, not across the chain.
    progress: done ? 1 : withinStage,
    error: null,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + clamped).toISOString(),
  };
}

/** How long the simulated evaluation takes (ms). */
export const MOCK_EVAL_MS = 8000;

/** The simulated eval job `elapsedMs` after it started. Eval jobs report no stages of their own. */
export function mockEvalJobAt(elapsedMs: number, id = 1, startedAt = 0): JobView {
  const clamped = Math.min(Math.max(elapsedMs, 0), MOCK_EVAL_MS);
  const done = clamped >= MOCK_EVAL_MS;
  return {
    id,
    type: "eval",
    status: done ? "done" : "running",
    stage: done ? "done" : null,
    progress: done ? 1 : clamped / MOCK_EVAL_MS,
    error: null,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt + clamped).toISOString(),
  };
}
