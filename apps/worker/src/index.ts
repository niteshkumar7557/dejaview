// The worker.
//
//   npm run start -w @dejaview/worker
//
// It takes jobs out of the jobs table and does them. The slow part (the model) happens outside
// any database transaction: the job is claimed, the transaction is closed, and only then does
// the work start.
//
// Only one worker runs at a time. It says so by taking a Postgres advisory lock; a second copy
// would find the lock taken and stop.

import {
  createPool,
  DecisionsRepository,
  EvalRunsRepository,
  JobsRepository,
  PostgresLlmCallStore,
  TopicsRepository,
  type JobRow,
} from "@dejaview/db";
import { loadLinker, loadPipeline } from "./adapters.js";
import {
  handleEval,
  handleExtract,
  handleIngest,
  handleLink,
  WaitingForPackageError,
  type WorkerContext,
} from "./handlers.js";

/** How long we wait between looking for work when there is none. */
const POLL_INTERVAL_MS = 2000;
/** How long a job waits before we try it again, when it could not be done yet. */
const RETRY_WAIT_SECONDS = 60;
/** How often we tell the database we are still alive on a long job. */
const HEARTBEAT_MS = 60_000;
/** How long a worker may hold a job before another one may take it over. */
const LEASE_SECONDS = 1800;
/** An arbitrary number that identifies our advisory lock. */
const LOCK_KEY = 913_701;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runJob(job: JobRow, context: WorkerContext): Promise<void> {
  const heartbeat = setInterval(() => {
    void context.jobs.heartbeat(job.id, job.attempt, LEASE_SECONDS).catch(() => {
      // A missed heartbeat is not worth stopping the job for.
    });
  }, HEARTBEAT_MS);

  try {
    switch (job.type) {
      case "ingest":
        await handleIngest(job, context);
        break;
      case "extract":
        await handleExtract(job, context);
        break;
      case "link":
        await handleLink(job, context);
        break;
      case "eval":
        await handleEval(job, context);
        break;
      default:
        throw new Error(`Unknown job type ${job.type}`);
    }
    await context.jobs.complete(job.id, job.attempt);
    console.log(`job ${job.id} (${job.type}) done`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof WaitingForPackageError) {
      // The job is not broken, the thing it needs is not here yet. Put it back and try again,
      // so the pipeline finishes on its own once the missing package lands.
      await context.jobs.requeue(job.id, job.attempt, message, RETRY_WAIT_SECONDS);
      console.warn(`job ${job.id} (${job.type}) is waiting: ${message}`);
      console.warn(`  retrying in ${RETRY_WAIT_SECONDS}s`);
    } else {
      await context.jobs.fail(job.id, job.attempt, message);
      console.error(`job ${job.id} (${job.type}) failed: ${message}`);
    }
  } finally {
    clearInterval(heartbeat);
  }
}

async function main(): Promise<void> {
  const pool = createPool();

  // Only one worker at a time.
  const lockClient = await pool.connect();
  const lockResult = await lockClient.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock($1) AS locked",
    [LOCK_KEY],
  );
  if (!lockResult.rows[0]?.locked) {
    console.error("Another worker is already running (the lock is taken). Stopping.");
    await lockClient.release();
    await pool.end();
    process.exitCode = 1;
    return;
  }

  const pipeline = await loadPipeline();
  const linker = await loadLinker();
  if (pipeline.adapter) console.log("pipeline: loaded");
  else console.warn(`pipeline: ${pipeline.reason}`);
  if (linker.adapter) console.log("linker: loaded");
  else console.warn(`linker: ${linker.reason}`);

  const jobs = new JobsRepository(pool);
  const context: WorkerContext = {
    pool,
    topics: new TopicsRepository(pool),
    decisions: new DecisionsRepository(pool),
    jobs,
    llmCalls: new PostgresLlmCallStore(pool),
    evalRuns: new EvalRunsRepository(pool),
    pipeline,
    linker,
    cpythonDir: process.env.CPYTHON_DIR ?? "",
    githubToken: process.env.GITHUB_TOKEN,
    report: async (job, stage, done, total) => {
      const progress = total > 0 ? Math.min(1, done / total) : 0;
      await jobs.updateProgress(job.id, job.attempt, stage, progress);
    },
  };

  console.log("DejaView worker is running. Press Ctrl+C to stop.");

  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    let job: JobRow | null = null;
    try {
      job = await jobs.claimNext(LEASE_SECONDS);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01") {
        console.error("The database has no tables yet. Run `npm run migrate` and start the worker again.");
        break;
      }
      console.error("Could not claim a job:", error);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    console.log(`job ${job.id} (${job.type}) picked up`);
    await runJob(job, context);
  }

  await lockClient.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]);
  await lockClient.release();
  await pool.end();
  console.log("Worker stopped.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
