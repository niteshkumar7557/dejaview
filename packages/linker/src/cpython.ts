import { execFile } from "node:child_process";
import { access, mkdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CPYTHON_URL = "https://github.com/python/cpython";

export type EnsureRepositoryResult =
  | { ok: true; path: string; cloned: boolean }
  | { ok: false; path: string | null; error: string };

export interface SymbolDefinition {
  /** Symbol requested by the caller; line numbers are deliberately not part of an anchor. */
  symbol: string;
  path: string;
  kind: "python_function" | "python_class" | "c_function";
}

/** Verify an existing CPython checkout or create a partial clone at CPYTHON_DIR. */
export async function ensureCpythonRepository(
  directory = process.env.CPYTHON_DIR,
): Promise<EnsureRepositoryResult> {
  if (!directory?.trim()) {
    return { ok: false, path: null, error: "CPYTHON_DIR is not set" };
  }

  const repositoryPath = path.resolve(directory);
  if (await pathExists(repositoryPath)) {
    const valid = await isRepositoryRoot(repositoryPath);
    return valid
      ? { ok: true, path: repositoryPath, cloned: false }
      : { ok: false, path: repositoryPath, error: "CPYTHON_DIR exists but is not a Git repository root" };
  }

  try {
    await mkdir(path.dirname(repositoryPath), { recursive: true });
    await execFileAsync("git", ["clone", "--filter=blob:none", CPYTHON_URL, repositoryPath]);
    if (!(await isRepositoryRoot(repositoryPath))) {
      return { ok: false, path: repositoryPath, error: "Clone completed but the destination is not a valid Git repository" };
    }
    return { ok: true, path: repositoryPath, cloned: true };
  } catch (error) {
    return { ok: false, path: repositoryPath, error: errorMessage(error) };
  }
}

/** Return whether a safe, relative file path exists in the repository's current HEAD tree. */
export async function pathExistsAtHead(repositoryPath: string, filePath: string): Promise<boolean> {
  if (!isSafeRepositoryPath(filePath) || !(await isRepositoryRoot(repositoryPath))) return false;

  try {
    const { stdout } = await execFileAsync("git", ["-C", repositoryPath, "cat-file", "-t", `HEAD:${filePath}`]);
    return stdout.trim() === "blob";
  } catch {
    return false;
  }
}

/** Return whether a commit SHA resolves to a commit object in this repository. */
export async function commitExistsAt(repositoryPath: string, sha: string): Promise<boolean> {
  if (!/^[a-f\d]{7,40}$/i.test(sha) || !(await isRepositoryRoot(repositoryPath))) return false;
  try {
    await execFileAsync("git", ["-C", repositoryPath, "cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Find Python function/class and C function definitions in the checked-out HEAD tree. */
export async function findSymbolDefinitions(
  repositoryPath: string,
  symbol: string,
): Promise<SymbolDefinition[]> {
  if (!(await isRepositoryRoot(repositoryPath))) return [];
  const symbolName = finalSymbolPart(symbol);
  if (!symbolName) return [];

  let candidates: string[];
  try {
    const { stdout } = await execFileAsync("git", [
      "-C", repositoryPath, "grep", "-l", "-I", "-F", "-e", symbolName,
      "HEAD", "--", "*.py", "*.pyi", "*.c", "*.h",
    ]);
    candidates = stdout.split("\n").filter(Boolean).map((candidate) => candidate.replace(/^HEAD:/, ""));
  } catch (error) {
    // git grep exits 1 when there are no matches; other errors also fail closed.
    if (errorCode(error) === 1) return [];
    return [];
  }

  const definitions: SymbolDefinition[] = [];
  for (const candidate of candidates) {
    let source: string;
    try {
      const result = await execFileAsync("git", ["-C", repositoryPath, "show", `HEAD:${candidate}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      source = result.stdout;
    } catch {
      continue;
    }

    if (/\.(?:py|pyi)$/.test(candidate)) {
      const kinds = pythonDefinitionKinds(source, symbolName);
      for (const kind of kinds) definitions.push({ symbol, path: candidate, kind });
    } else if (hasCFunctionDefinition(source, symbolName)) {
      definitions.push({ symbol, path: candidate, kind: "c_function" });
    }
  }

  return uniqueDefinitions(definitions);
}

function pythonDefinitionKinds(source: string, name: string): Array<"python_function" | "python_class"> {
  const escaped = escapeRegExp(name);
  const functionDefinition = new RegExp(`^[\\t ]*(?:async[\\t ]+)?def[\\t ]+${escaped}[\\t ]*\\(`, "m");
  const classDefinition = new RegExp(`^[\\t ]*class[\\t ]+${escaped}(?=[\\t ]*(?:\\(|:|$))`, "m");
  const kinds: Array<"python_function" | "python_class"> = [];
  if (functionDefinition.test(source)) kinds.push("python_function");
  if (classDefinition.test(source)) kinds.push("python_class");
  return kinds;
}

function hasCFunctionDefinition(source: string, name: string): boolean {
  const code = maskCCommentsAndStrings(source);
  const matcher = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, "g");
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(code)) !== null) {
    const nameStart = match.index;
    const prefixStart = Math.max(
      code.lastIndexOf(";", nameStart),
      code.lastIndexOf("{", nameStart),
      code.lastIndexOf("}", nameStart),
      code.lastIndexOf("#", nameStart),
    ) + 1;
    const prefix = code.slice(prefixStart, nameStart).trim();
    if (!looksLikeReturnType(prefix)) continue;

    const openParen = code.indexOf("(", nameStart + match[0].indexOf("("));
    const closeParen = findMatchingParen(code, openParen);
    if (closeParen < 0) continue;
    const tail = code.slice(closeParen + 1).replace(/^(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*(?:\n|$))*/, "");
    if (tail.startsWith("{")) return true;
  }

  return false;
}

function looksLikeReturnType(prefix: string): boolean {
  if (!prefix || /(?:^|\s)(?:if|while|switch|for|return|sizeof|case|throw)\s*\(?\s*$/.test(prefix)) return false;
  if (/[=.]\s*$|->\s*$|\(\s*$/.test(prefix)) return false;
  return /(?:[A-Za-z_][A-Za-z0-9_]*|\*)\s*$/.test(prefix);
}

function findMatchingParen(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function maskCCommentsAndStrings(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (part) =>
    part.replace(/[^\n]/g, " "),
  );
}

function finalSymbolPart(symbol: string): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(symbol)) return null;
  return symbol.split(".").at(-1) ?? null;
}

function isSafeRepositoryPath(filePath: string): boolean {
  if (!filePath || filePath.includes("\\") || path.posix.isAbsolute(filePath)) return false;
  return filePath.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

async function isRepositoryRoot(repositoryPath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", repositoryPath, "rev-parse", "--show-toplevel"]);
    return (await realpath(stdout.trim())) === (await realpath(repositoryPath));
  } catch {
    return false;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function uniqueDefinitions(definitions: SymbolDefinition[]): SymbolDefinition[] {
  const seen = new Set<string>();
  return definitions.filter((definition) => {
    const key = `${definition.kind}:${definition.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function errorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "number" ? code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
