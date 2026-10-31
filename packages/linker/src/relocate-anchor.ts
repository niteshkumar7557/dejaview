import { execFile } from "node:child_process";
import type { CodeAnchor } from "@dejaview/shared";
import { promisify } from "node:util";
import { commitExistsAt, findSymbolDefinitions, pathExistsAtHead } from "./cpython.js";

const execFileAsync = promisify(execFile);

interface RenameEvent {
  from: string;
  to: string;
}

/** Update a stale anchor path using verified Git rename history or one unique symbol definition. */
export async function relocateAnchor(anchor: CodeAnchor, repoDir: string): Promise<CodeAnchor> {
  if (!repoDir) return anchor;

  const pathAtLastCheck = anchor.currentPath ?? anchor.originalPath;
  if (await pathExistsAtHead(repoDir, pathAtLastCheck)) {
    return anchor.currentPath ? anchor : { ...anchor, currentPath: pathAtLastCheck, relocatedBy: null };
  }

  const historyPath = await findPathThroughHistory(anchor, repoDir);
  if (historyPath && historyPath !== anchor.currentPath && await pathExistsAtHead(repoDir, historyPath)) {
    return { ...anchor, currentPath: historyPath, relocatedBy: "git-follow" };
  }

  if (!anchor.symbol) return anchor;
  const definitions = await findSymbolDefinitions(repoDir, anchor.symbol);
  const candidates = [...new Set(definitions
    .filter((definition) => qualifiedSymbolMatchesPath(anchor.symbol!, definition.path))
    .map((definition) => definition.path))];
  if (candidates.length !== 1 || candidates[0] === anchor.currentPath) return anchor;

  const symbolPath = candidates[0]!;
  if (!(await pathExistsAtHead(repoDir, symbolPath))) return anchor;
  return { ...anchor, currentPath: symbolPath, relocatedBy: "symbol-search" };
}

async function findPathThroughHistory(anchor: CodeAnchor, repoDir: string): Promise<string | null> {
  if (!isSafeRelativePath(anchor.originalPath)) return null;
  const startCommit = anchor.originalCommit;
  if (startCommit) {
    if (!(await commitExistsAt(repoDir, startCommit))) return null;
    if (!(await isAncestor(repoDir, startCommit, "HEAD"))) return null;
    if (!(await isBlobAtCommit(repoDir, startCommit, anchor.originalPath))) return null;
  }

  const args = ["-C", repoDir, "log", "--first-parent", "--find-renames", "--diff-filter=R", "--name-status", "--format=COMMIT:%H", "--reverse"];
  args.push(startCommit ? `${startCommit}..HEAD` : "HEAD");
  let output: string;
  try {
    ({ stdout: output } = await execFileAsync("git", args, { maxBuffer: 20 * 1024 * 1024 }));
  } catch {
    return null;
  }

  const events = parseRenameEvents(output);
  let pathAtHead = anchor.originalPath;
  for (const event of events) {
    if (event.from === pathAtHead) pathAtHead = event.to;
  }

  if (pathAtHead === anchor.originalPath || !(await pathExistsAtHead(repoDir, pathAtHead))) return null;
  return await followsFromOriginalPath(repoDir, pathAtHead, anchor.originalPath, startCommit) ? pathAtHead : null;
}

async function followsFromOriginalPath(
  repoDir: string,
  headPath: string,
  originalPath: string,
  originalCommit: string | null,
): Promise<boolean> {
  let output: string;
  try {
    const args = ["-C", repoDir, "log", "--follow", "--find-renames", "--name-status", "--format=COMMIT:%H"];
    args.push(originalCommit ? `${originalCommit}..HEAD` : "HEAD", "--", headPath);
    ({ stdout: output } = await execFileAsync("git", args, { maxBuffer: 20 * 1024 * 1024 }));
  } catch {
    return false;
  }

  // git log --follow walks HEAD backward; invert each R record while walking that output.
  let tracedPath = headPath;
  for (const event of parseRenameEvents(output)) {
    if (event.to === tracedPath) tracedPath = event.from;
    if (tracedPath === originalPath) return true;
  }
  return tracedPath === originalPath;
}

function parseRenameEvents(output: string): RenameEvent[] {
  const events: RenameEvent[] = [];
  for (const line of output.split("\n")) {
    const columns = line.split("\t");
    if (columns.length === 3 && /^R\d*$/.test(columns[0]!)) {
      events.push({ from: columns[1]!, to: columns[2]! });
    }
  }
  return events;
}

async function isAncestor(repoDir: string, commit: string, descendant: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["-C", repoDir, "merge-base", "--is-ancestor", commit, descendant]);
    return true;
  } catch {
    return false;
  }
}

async function isBlobAtCommit(repoDir: string, commit: string, filePath: string): Promise<boolean> {
  if (!isSafeRelativePath(filePath)) return false;
  try {
    const { stdout } = await execFileAsync("git", ["-C", repoDir, "cat-file", "-t", `${commit}:${filePath}`]);
    return stdout.trim() === "blob";
  } catch {
    return false;
  }
}

function qualifiedSymbolMatchesPath(symbol: string, definitionPath: string): boolean {
  const segments = symbol.split(".");
  if (segments.length < 2) return true;
  const modulePath = segments.slice(0, -1).join("/");
  return definitionPath.endsWith(`/${modulePath}.py`) || definitionPath.endsWith(`/${modulePath}.pyi`);
}

function isSafeRelativePath(filePath: string): boolean {
  return filePath.length > 0
    && !filePath.includes("\\")
    && !filePath.startsWith("/")
    && filePath.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
