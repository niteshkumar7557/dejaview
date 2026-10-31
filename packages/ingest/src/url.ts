// Parsing of the URLs the user pastes into the ingest form.
// Discourse and GitHub look different enough that guessing between them is not worth it:
// we parse both and let the caller pick the adapter that matched.

export interface DiscourseUrl {
  kind: "discourse";
  /** Origin of the forum, e.g. "https://discuss.python.org". */
  baseUrl: string;
  topicId: number;
  /** Slug of the topic, when the URL carries one. */
  slug: string | null;
  /** Post number the URL points at, when it carries one. */
  postNumber: number | null;
}

export interface GithubUrl {
  kind: "github";
  owner: string;
  repo: string;
  number: number;
  isPullRequest: boolean;
}

const DISCOURSE_TOPIC_PATH = "/t/";

function stripJsonSuffix(value: string): string {
  return value.endsWith(".json") ? value.slice(0, -".json".length) : value;
}

function parseNumeric(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/**
 * Accepts the three shapes a Discourse topic link comes in:
 *   /t/{id}                 /t/{slug}/{id}          /t/{slug}/{id}/{post_number}
 * and ignores the query string, the fragment and a trailing ".json".
 */
export function parseDiscourseUrl(input: string): DiscourseUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const path = stripJsonSuffix(url.pathname);
  const marker = path.indexOf(DISCOURSE_TOPIC_PATH);
  if (marker === -1) return null;

  const segments = path
    .slice(marker + DISCOURSE_TOPIC_PATH.length)
    .split("/")
    .filter((segment) => segment.length > 0);
  if (segments.length === 0) return null;

  const first = segments[0] ?? "";
  let slug: string | null = null;
  let topicId: number | null = null;
  let rest: string[] = [];

  if (/^\d+$/.test(first)) {
    topicId = Number(first);
    rest = segments.slice(1);
  } else {
    slug = first;
    topicId = parseNumeric(segments[1]);
    rest = segments.slice(2);
  }
  if (topicId === null) return null;

  const postNumber = parseNumeric(rest[0]);
  return {
    kind: "discourse",
    baseUrl: url.origin,
    topicId,
    slug,
    postNumber,
  };
}

/**
 * Accepts /{owner}/{repo}/issues/{n} and /{owner}/{repo}/pull/{n}.
 * A trailing #issuecomment-... fragment is ignored: we always fetch the whole thread.
 */
export function parseGithubUrl(input: string): GithubUrl | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;

  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length < 4) return null;

  const owner = segments[0] ?? "";
  const repo = segments[1] ?? "";
  const kind = segments[2] ?? "";
  const number = parseNumeric(segments[3]);
  if (!owner || !repo || number === null) return null;

  if (kind === "pull") {
    return { kind: "github", owner, repo, number, isPullRequest: true };
  }
  if (kind === "issues") {
    return { kind: "github", owner, repo, number, isPullRequest: false };
  }
  return null;
}
