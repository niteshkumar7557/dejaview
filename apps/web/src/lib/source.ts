import type { DataSource } from "./data-source";
import { createHttpSource } from "./http-source";

export const usingMocks = process.env.NEXT_PUBLIC_USE_MOCKS !== "0";

let cached: DataSource | null = null;

/** The app's one data source: mock data unless NEXT_PUBLIC_USE_MOCKS is "0". */
export function getSource(): DataSource {
  if (cached) return cached;
  if (usingMocks) {
    throw new Error("mock source not built yet");
  }
  cached = createHttpSource(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");
  return cached;
}
