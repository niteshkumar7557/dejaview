import type { DataSource } from "./data-source";

/** Every DataSource method. The type check below fails if the interface gains one that is not listed. */
const METHODS = [
  "listTopics", "getTopic", "getTimeline", "searchDecisions", "getDecision", "getLlmCalls",
  "listEvalRuns", "listPrChecks", "getJob", "startIngest", "startIngestUpload", "startEval",
] as const satisfies readonly (keyof DataSource)[];

type Missing = Exclude<keyof DataSource, (typeof METHODS)[number]>;
const allListed: [Missing] extends [never] ? true : Missing = true;
void allListed;

/**
 * A DataSource that loads its implementation on first use. Every method is already async, so callers
 * cannot tell. Used for the mock source: behind a dynamic import() the sample dataset becomes its own
 * chunk, which the browser only downloads in sample-data mode.
 */
export function lazySource(load: () => Promise<DataSource>): DataSource {
  let loading: Promise<DataSource> | null = null;
  const impl = () => (loading ??= load());
  const entries = METHODS.map((name) => [
    name,
    async (...args: unknown[]) => {
      const source = await impl();
      return (source[name] as (...a: unknown[]) => Promise<unknown>)(...args);
    },
  ]);
  return Object.fromEntries(entries) as DataSource;
}
