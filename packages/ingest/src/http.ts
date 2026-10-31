// One place where we talk to the network, so the adapters stay testable:
// every fetch goes through the injected `FetchLike`, and tests inject a fake.

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface IngestOptions {
  /** Injected in tests; defaults to the global fetch. */
  fetchImpl?: FetchLike;
  /** Optional token for the GitHub REST API. Raises the rate limit from 60 to 5000 per hour. */
  githubToken?: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
}

export class IngestError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "IngestError";
    this.status = status;
  }
}

const USER_AGENT = "dejaview/0.1 (+https://github.com/sipmap/dejaview)";

export function resolveFetch(options: IngestOptions): FetchLike {
  return options.fetchImpl ?? ((input, init) => fetch(input, init));
}

/** GETs a JSON document and fails loudly with the URL and status when the server does not. */
export async function getJson(url: string, options: IngestOptions, request: RequestOptions = {}): Promise<unknown> {
  const response = await resolveFetch(options)(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...request.headers,
    },
  });
  if (!response.ok) {
    throw new IngestError(`GET ${url} failed with HTTP ${response.status}`, response.status);
  }
  const text = await response.text();
  if (!text) {
    throw new IngestError(`GET ${url} returned an empty body`, response.status);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new IngestError(`GET ${url} returned a body that is not JSON`, response.status);
  }
}
