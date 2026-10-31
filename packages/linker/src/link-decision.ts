import type { CodeAnchor, ExtractedDecision, ThreadPost } from "@dejaview/shared";
import { commitExistsAt, findSymbolDefinitions, pathExistsAtHead } from "./cpython.js";
import { lookupPullRequest, type GitHubPullRequestInfo } from "./github.js";
import { findReferences, type Reference } from "./references.js";

export interface LinkDecisionContext {
  repoDir: string;
  repo: string;
  githubToken?: string;
}

interface PostReference {
  post: ThreadPost;
  reference: Reference;
}

/** Resolve only references in decision evidence posts and their direct replies. */
export async function linkDecision(
  decision: ExtractedDecision,
  posts: ThreadPost[],
  ctx: LinkDecisionContext,
): Promise<CodeAnchor[]> {
  const evidencePostIds = new Set(decision.reasons.flatMap((reason) => reason.evidence.map((evidence) => evidence.postId)));
  if (evidencePostIds.size === 0 || !ctx.repo) return [];

  const sourcePosts = posts.filter((post) => evidencePostIds.has(post.id) || (post.replyToId != null && evidencePostIds.has(post.replyToId)));
  const references: PostReference[] = sourcePosts.flatMap((post) => findReferences(post).map((reference) => ({ post, reference })));
  if (references.length === 0) return [];

  const anchors: CodeAnchor[] = [];
  const prCache = new Map<string, Promise<GitHubPullRequestInfo | null>>();

  // PR references are strongest: turn their changed files into anchors first.
  for (const { post, reference } of references) {
    const target = pullRequestTarget(reference, ctx.repo);
    if (!target) continue;
    const cacheKey = `${target.repository.toLowerCase()}#${target.number}`;
    let lookup = prCache.get(cacheKey);
    if (!lookup) {
      lookup = lookupPullRequest(target.number, { repository: target.repository, token: ctx.githubToken })
        .then((result) => result.ok ? result.pullRequest : null)
        .catch(() => null);
      prCache.set(cacheKey, lookup);
    }
    const pullRequest = await lookup;
    if (!pullRequest) continue;

    for (const file of pullRequest.files) {
      const originalPath = file.previousPath ?? file.path;
      const isLocalRepository = pullRequest.repository.fullName.toLowerCase() === ctx.repo.toLowerCase();
      const currentPath = isLocalRepository && await pathExistsAtHead(ctx.repoDir, file.path) ? file.path : null;
      addAnchor(anchors, {
        repo: pullRequest.repository.fullName,
        symbol: null,
        originalPath,
        originalCommit: pullRequest.mergeCommitSha,
        currentPath,
        relocatedBy: null,
        linkMethod: "pr_ref",
        evidencePostId: post.id,
      });
    }
  }

  // Explicit file paths are second priority and must exist in the local HEAD tree.
  for (const { post, reference } of references) {
    if (reference.type !== "path" || !(await pathExistsAtHead(ctx.repoDir, reference.path))) continue;
    if (hasPrAnchorForPath(anchors, ctx.repo, reference.path, post.id)) continue;
    addAnchor(anchors, {
      repo: ctx.repo,
      symbol: null,
      originalPath: reference.path,
      originalCommit: await commitForPost(ctx.repoDir, references, post),
      currentPath: reference.path,
      relocatedBy: null,
      linkMethod: "path_mention",
      evidencePostId: post.id,
    });
  }

  // Symbols provide supporting links only when an actual definition is found.
  for (const { post, reference } of references) {
    if (reference.type !== "symbol") continue;
    const definitions = await findSymbolDefinitions(ctx.repoDir, reference.symbol);
    for (const definition of definitions) {
      if (!qualifiedSymbolMatchesPath(reference.symbol, definition.path)) continue;
      addAnchor(anchors, {
        repo: ctx.repo,
        symbol: reference.symbol,
        originalPath: definition.path,
        originalCommit: await commitForPost(ctx.repoDir, references, post),
        currentPath: definition.path,
        relocatedBy: null,
        linkMethod: "symbol_mention",
        evidencePostId: post.id,
      });
    }
  }

  return anchors;
}

function pullRequestTarget(reference: Reference, defaultRepo: string): { repository: string; number: number } | null {
  if (reference.type === "github_url" || reference.type === "repository") {
    return { repository: reference.repository, number: reference.number };
  }
  if (reference.type === "issue" && reference.prefix === "gh") {
    return { repository: defaultRepo, number: reference.number };
  }
  return null;
}

async function commitForPost(repoDir: string, references: PostReference[], post: ThreadPost): Promise<string | null> {
  const commits = new Set(references
    .filter((item) => item.post.id === post.id && item.reference.type === "commit")
    .map((item) => item.reference.type === "commit" ? item.reference.sha : ""));
  if (commits.size !== 1) return null;
  const sha = commits.values().next().value as string | undefined;
  return sha && await commitExistsAt(repoDir, sha) ? sha : null;
}

function qualifiedSymbolMatchesPath(symbol: string, definitionPath: string): boolean {
  const segments = symbol.split(".");
  if (segments.length < 2) return true;
  const modulePath = segments.slice(0, -1).join("/");
  return definitionPath.endsWith(`/${modulePath}.py`) || definitionPath.endsWith(`/${modulePath}.pyi`);
}

function hasPrAnchorForPath(anchors: CodeAnchor[], repo: string, filePath: string, postId: number): boolean {
  return anchors.some((anchor) => anchor.linkMethod === "pr_ref"
    && anchor.repo.toLowerCase() === repo.toLowerCase()
    && anchor.evidencePostId === postId
    && (anchor.originalPath === filePath || anchor.currentPath === filePath));
}

function addAnchor(anchors: CodeAnchor[], anchor: CodeAnchor): void {
  const duplicate = anchors.some((existing) => existing.repo.toLowerCase() === anchor.repo.toLowerCase()
    && existing.symbol === anchor.symbol
    && existing.originalPath === anchor.originalPath
    && existing.originalCommit === anchor.originalCommit
    && existing.currentPath === anchor.currentPath
    && existing.linkMethod === anchor.linkMethod
    && existing.evidencePostId === anchor.evidencePostId);
  if (!duplicate) anchors.push(anchor);
}
