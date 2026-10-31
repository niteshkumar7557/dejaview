// The data layer. Only this package talks to Postgres.
//
//   import { createPool, TopicsRepository } from "@dejaview/db";
//
// Everything here uses parameterised SQL. Nothing here builds a query by pasting strings together.

export { createPool, withTransaction } from "./client.js";
export { TopicsRepository, type SavedThread, type TopicRow } from "./topics.js";
export { DecisionsRepository, type DecisionRow, type SearchInput } from "./decisions.js";
export { JobsRepository, type JobRow, DEFAULT_LEASE_SECONDS } from "./jobs.js";
export { PostgresLlmCallStore, type LlmCallView } from "./llmCalls.js";
export { EvalRunsRepository } from "./evalRuns.js";
export { PrChecksRepository } from "./prChecks.js";
export { TimelineRepository } from "./timeline.js";
export { createTestDatabase, type TestDatabase } from "./testing.js";
