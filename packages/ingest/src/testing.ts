// Helpers shared by the ingest tests. Not part of the public API.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { FetchLike } from "./http.js";

export function loadTestData(name: string): unknown {
  const path = fileURLToPath(new URL(`../testdata/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

export interface FakeRoute {
  /** Substring or regular expression matched against the requested URL. */
  pattern: string | RegExp;
  body: unknown;
  status?: number;
}

export interface FakeFetch {
  fetchImpl: FetchLike;
  /** Every URL that was requested, in order. */
  calls: string[];
  headers: { url: string; headers: Record<string, string> }[];
}

export function fakeFetch(routes: FakeRoute[]): FakeFetch {
  const calls: string[] = [];
  const headers: { url: string; headers: Record<string, string> }[] = [];

  const fetchImpl: FetchLike = async (input, init) => {
    const url = String(input);
    calls.push(url);
    const requestHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      requestHeaders[key] = value;
    }
    headers.push({ url, headers: requestHeaders });

    for (const route of routes) {
      const hit =
        typeof route.pattern === "string" ? url.includes(route.pattern) : route.pattern.test(url);
      if (!hit) continue;
      const status = route.status ?? 200;
      const payload = status >= 400 ? { message: "error" } : route.body;
      return new Response(JSON.stringify(payload), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  };

  return { fetchImpl, calls, headers };
}
