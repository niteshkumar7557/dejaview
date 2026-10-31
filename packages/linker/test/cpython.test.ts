import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureCpythonRepository, findSymbolDefinitions, pathExistsAtHead } from "../src/index.js";

const execFileAsync = promisify(execFile);
let temporaryDirectory: string;
let repositoryPath: string;

async function git(...args: string[]): Promise<void> {
  await execFileAsync("git", ["-C", repositoryPath, ...args]);
}

beforeEach(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "dejaview-cpython-test-"));
  repositoryPath = path.join(temporaryDirectory, "repo");
  await mkdir(repositoryPath);
  await execFileAsync("git", ["init", repositoryPath]);
  await git("config", "user.name", "DejaView Test");
  await git("config", "user.email", "test@example.invalid");
});

afterEach(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
});

async function commitFiles(): Promise<void> {
  await git("add", ".");
  await git("commit", "-m", "test fixture");
}

describe("CPython repository helpers", () => {
  it("verifies an existing repository without cloning", async () => {
    await writeFile(path.join(repositoryPath, "tracked.txt"), "fixture\n");
    await commitFiles();

    await expect(ensureCpythonRepository(repositoryPath)).resolves.toEqual({
      ok: true,
      path: repositoryPath,
      cloned: false,
    });
  });

  it("reports missing and invalid repository locations safely", async () => {
    await expect(ensureCpythonRepository("")).resolves.toMatchObject({ ok: false, path: null });
    await expect(ensureCpythonRepository(temporaryDirectory)).resolves.toMatchObject({ ok: false, error: expect.any(String) });
    expect(await pathExistsAtHead(path.join(temporaryDirectory, "missing"), "src/example.py")).toBe(false);
  });

  it("checks file paths at HEAD and rejects missing or unsafe paths", async () => {
    await mkdir(path.join(repositoryPath, "Lib"));
    await writeFile(path.join(repositoryPath, "Lib", "example.py"), "value = 1\n");
    await commitFiles();

    expect(await pathExistsAtHead(repositoryPath, "Lib/example.py")).toBe(true);
    expect(await pathExistsAtHead(repositoryPath, "Lib/missing.py")).toBe(false);
    expect(await pathExistsAtHead(repositoryPath, "../outside.py")).toBe(false);
    expect(await pathExistsAtHead(repositoryPath, "/absolute.py")).toBe(false);
  });

  it("finds Python functions and classes while ignoring call sites", async () => {
    const pythonPath = path.join(repositoryPath, "Lib", "sample.py");
    const callerPath = path.join(repositoryPath, "Lib", "caller.py");
    await mkdir(path.dirname(pythonPath), { recursive: true });
    await writeFile(pythonPath, [
      "async def target_function(value):",
      "    return value",
      "",
      "class SampleType:",
      "    pass",
      "",
      "def caller():",
      "    target_function(1)",
    ].join("\n"));
    await writeFile(callerPath, "def other():\n    call_only_symbol()\n");
    await commitFiles();

    await expect(findSymbolDefinitions(repositoryPath, "target_function")).resolves.toEqual([
      { symbol: "target_function", path: "Lib/sample.py", kind: "python_function" },
    ]);
    await expect(findSymbolDefinitions(repositoryPath, "SampleType")).resolves.toEqual([
      { symbol: "SampleType", path: "Lib/sample.py", kind: "python_class" },
    ]);
    await expect(findSymbolDefinitions(repositoryPath, "call_only_symbol")).resolves.toEqual([]);
    await expect(findSymbolDefinitions(repositoryPath, "module.target_function")).resolves.toEqual([
      { symbol: "module.target_function", path: "Lib/sample.py", kind: "python_function" },
    ]);
  });

  it("finds PEP 695 generic functions and classes, like typing.override in CPython", async () => {
    const typingPath = path.join(repositoryPath, "Lib", "typing.py");
    await mkdir(path.dirname(typingPath), { recursive: true });
    await writeFile(typingPath, [
      "def override[F: _Func](method: F, /) -> F:",
      "    return method",
      "",
      "class Box[T]:",
      "    pass",
    ].join("\n"));
    await commitFiles();

    await expect(findSymbolDefinitions(repositoryPath, "typing.override")).resolves.toEqual([
      { symbol: "typing.override", path: "Lib/typing.py", kind: "python_function" },
    ]);
    await expect(findSymbolDefinitions(repositoryPath, "Box")).resolves.toEqual([
      { symbol: "Box", path: "Lib/typing.py", kind: "python_class" },
    ]);
  });

  it("finds C function definitions but not prototypes or calls", async () => {
    const sourceDirectory = path.join(repositoryPath, "Objects");
    await mkdir(sourceDirectory);
    await writeFile(path.join(sourceDirectory, "sample.c"), [
      "int c_target(int value);",
      "",
      "int c_target(int value)",
      "{",
      "    return value;",
      "}",
      "",
      "void caller(void) { c_call_only(); }",
    ].join("\n"));
    await commitFiles();

    await expect(findSymbolDefinitions(repositoryPath, "c_target")).resolves.toEqual([
      { symbol: "c_target", path: "Objects/sample.c", kind: "c_function" },
    ]);
    await expect(findSymbolDefinitions(repositoryPath, "c_call_only")).resolves.toEqual([]);
    await expect(findSymbolDefinitions(repositoryPath, "missing_symbol")).resolves.toEqual([]);
    await expect(findSymbolDefinitions(repositoryPath, "bad-name")).resolves.toEqual([]);
  });

  it("does not return source line numbers in symbol results", async () => {
    await writeFile(path.join(repositoryPath, "sample.py"), "def anchored():\n    return None\n");
    await commitFiles();

    const [definition] = await findSymbolDefinitions(repositoryPath, "anchored");
    expect(definition).toEqual({ symbol: "anchored", path: "sample.py", kind: "python_function" });
    expect(definition).not.toHaveProperty("line");
  });
});
