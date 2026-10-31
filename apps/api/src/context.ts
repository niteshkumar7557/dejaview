// Everything the routes need, in one place.

import {
  createPool,
  DecisionsRepository,
  EvalRunsRepository,
  JobsRepository,
  PostgresLlmCallStore,
  PrChecksRepository,
  TimelineRepository,
  TopicsRepository,
} from "@dejaview/db";
import type { Pool } from "pg";
import type { PrMatcher } from "./prMatcher.js";

export interface ApiContext {
  pool: Pool;
  topics: TopicsRepository;
  decisions: DecisionsRepository;
  jobs: JobsRepository;
  llmCalls: PostgresLlmCallStore;
  evalRuns: EvalRunsRepository;
  prChecks: PrChecksRepository;
  timeline: TimelineRepository;
  prMatcher: PrMatcher;
  /** The token the GitHub Action has to send. Undefined means the endpoint is open. */
  apiToken: string | undefined;
  /** Where the dashboard lives, so the PR comment can link to it. */
  dashboardUrl: string;
}

export function createContext(
  pool: Pool,
  prMatcher: PrMatcher,
  options: { apiToken?: string | undefined; dashboardUrl?: string } = {},
): ApiContext {
  return {
    pool,
    topics: new TopicsRepository(pool),
    decisions: new DecisionsRepository(pool),
    jobs: new JobsRepository(pool),
    llmCalls: new PostgresLlmCallStore(pool),
    evalRuns: new EvalRunsRepository(pool),
    prChecks: new PrChecksRepository(pool),
    timeline: new TimelineRepository(pool),
    prMatcher,
    apiToken: options.apiToken,
    // The dashboard is a different service from the API, so it has its own variable.
    dashboardUrl: options.dashboardUrl ?? process.env.DASHBOARD_URL ?? "",
  };
}

/** Opens the pool the API uses. */
export function openPool(): Pool {
  return createPool();
}
