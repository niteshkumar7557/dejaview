import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CodeAnchor } from "@dejaview/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { relocateAnchor } from "../src/index.js";

let temporaryDirectory: string;
let repositoryPath: string;
let originalCommit: string;

async function git(...args: string[]): Promise<string> {
  const result = await execFileAsync("git", ["-C", repositoryPath, ...args]);
  return result.stdout.trim();
}

const execFileAsync = promisify(execFile);

async function writeRepoFile(filePath: string, contents: string): Promise<void> {
  const absolutePath = path.join(repositoryPath, filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents);
}

async function commit(message: string): Promise<string> {
  await git("add", "-A");
  await git("commit", "-m", message);
  return git("rev-parse", "HEAD");
}

function anchor(overrides: Partial<CodeAnchor> = {}): CodeAnchor {
  return {
    repo: "python/cpython",
    symbol: null,
    originalPath: "Lib/original.py",
    originalCommit,
    currentPath: "Lib/original.py",
    relocatedBy: null,
    linkMethod: "path_mention",
    evidencePostId: 42,
    ...overrides,
  };
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "dejaview-relocate-anchor-"));
  repositoryPath = path.join(temporaryDirectory, "repo");
  await mkdir(repositoryPath);
  await execFileAsync("git", ["init", repositoryPath]);
  await execFileAsync("git", ["-C", repositoryPath, "config", "user.name", "DejaView Test"]);
  await execFileAsync("git", ["-C", repositoryPath, "config", "user.email", "test@example.invalid"]);
  await writeRepoFile("Lib/original.py", "def keep_name(value):\n    return value\n");
  originalCommit = await commit("initial source");
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

describe("relocateAnchor", () => {
  it("returns an unchanged anchor when its current path still exists", async () => {
    const source = anchor();
    const result = await relocateAnchor(source, repositoryPath);
    expect(result).toBe(source);
  });

  it("follows one file rename and preserves original identity and provenance", async () => {
    await git("mv", "Lib/original.py", "Lib/renamed.py");
    await commit("rename once");
    const source = anchor();

    const result = await relocateAnchor(source, repositoryPath);
    expect(result).toEqual({ ...source, currentPath: "Lib/renamed.py", relocatedBy: "git-follow" });
    expect(result.originalPath).toBe("Lib/original.py");
    expect(result.evidencePostId).toBe(42);
  });

  it("follows multiple consecutive renames in the forward direction", async () => {
    await git("mv", "Lib/original.py", "Lib/middle.py");
    await commit("first rename");
    await mkdir(path.join(repositoryPath, "Objects"), { recursive: true });
    await git("mv", "Lib/middle.py", "Objects/final.py");
    await commit("second rename");

    const result = await relocateAnchor(anchor(), repositoryPath);
    expect(result.currentPath).toBe("Objects/final.py");
    expect(result.relocatedBy).toBe("git-follow");
  });

  it("follows moves into another directory", async () => {
    await mkdir(path.join(repositoryPath, "Python"), { recursive: true });
    await git("mv", "Lib/original.py", "Python/original.py");
    await commit("move directory");

    const result = await relocateAnchor(anchor(), repositoryPath);
    expect(result.currentPath).toBe("Python/original.py");
    expect(result.relocatedBy).toBe("git-follow");
  });

  it("resolves a missing currentPath using the original path and history", async () => {
    await git("mv", "Lib/original.py", "Lib/restored-name.py");
    await commit("rename without cached current path");

    const result = await relocateAnchor(anchor({ currentPath: null }), repositoryPath);
    expect(result.currentPath).toBe("Lib/restored-name.py");
    expect(result.relocatedBy).toBe("git-follow");
  });

  it("uses the symbol helper when rename history cannot establish the new path", async () => {
    const sourceText = ["def unique_target(value):", "    return value", ...Array.from({ length: 20 }, (_, index) => `# unrelated old line ${index}`)].join("\n");
    await writeRepoFile("Lib/original.py", sourceText);
    originalCommit = await commit("define fallback symbol");
    await git("rm", "Lib/original.py");
    await writeRepoFile("Python/new_location.py", ["def unique_target(value):", "    return value", ...Array.from({ length: 20 }, (_, index) => `# entirely different new line ${index}`)].join("\n"));
    await commit("replace file without detectable rename");

    const source = anchor({ symbol: "unique_target" });
    const result = await relocateAnchor(source, repositoryPath);
    expect(result).toEqual({ ...source, currentPath: "Python/new_location.py", relocatedBy: "symbol-search" });
  });

  it("relocates to a unique C function definition", async () => {
    await git("rm", "Lib/original.py");
    await writeRepoFile("Objects/old.c", "int PyMoveTarget(int value) { return value; }\n");
    originalCommit = await commit("add C definition");
    await git("rm", "Objects/old.c");
    await writeRepoFile("Python/new.c", "int PyMoveTarget(int value) { return value + 1; }\n");
    await commit("move C definition without rename history");

    const result = await relocateAnchor(anchor({ symbol: "PyMoveTarget" }), repositoryPath);
    expect(result.currentPath).toBe("Python/new.c");
    expect(result.relocatedBy).toBe("symbol-search");
  });

  it("does not choose between ambiguous symbol definitions", async () => {
    await git("rm", "Lib/original.py");
    await writeRepoFile("Lib/first.py", "def ambiguous_target():\n    return 1\n");
    await writeRepoFile("Python/second.py", "def ambiguous_target():\n    return 2\n");
    await commit("add ambiguous definitions");

    const source = anchor({ symbol: "ambiguous_target" });
    await expect(relocateAnchor(source, repositoryPath)).resolves.toBe(source);
  });

  it("preserves a deleted file anchor when its symbol cannot be found", async () => {
    await git("rm", "Lib/original.py");
    await commit("delete file");
    const source = anchor({ symbol: "missing_symbol" });

    await expect(relocateAnchor(source, repositoryPath)).resolves.toBe(source);
  });

  it("uses the full first-parent history when originalCommit is absent", async () => {
    await git("mv", "Lib/original.py", "Lib/without-commit.py");
    await commit("rename without anchor commit");
    const source = anchor({ originalCommit: null });

    const result = await relocateAnchor(source, repositoryPath);
    expect(result.currentPath).toBe("Lib/without-commit.py");
    expect(result.originalCommit).toBeNull();
    expect(result.relocatedBy).toBe("git-follow");
  });

  it("returns the anchor unchanged for an invalid repository", async () => {
    const source = anchor();
    await expect(relocateAnchor(source, path.join(temporaryDirectory, "missing-repo"))).resolves.toBe(source);
  });
});
