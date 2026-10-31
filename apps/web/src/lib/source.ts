import type { DataSource } from "./data-source";
import { createHttpSource } from "./http-source";
import { lazySource } from "./lazy-source";

export const usingMocks = process.env.NEXT_PUBLIC_USE_MOCKS !== "0";

let cached: DataSource | null = null;

/**
 * The app's one data source: mock data unless NEXT_PUBLIC_USE_MOCKS is "0".
 * The mock source is imported lazily so the live dashboard does not ship the sample dataset.
 */
export function getSource(): DataSource {
  if (cached) return cached;
  cached = usingMocks
    ? lazySource(() => import("./mock-source").then((m) => m.createMockSource()))
    : createHttpSource(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
  return cached;
}
