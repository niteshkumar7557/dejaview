// The CPython clone the linker needs.
//
// Without it, a decision can be attached to "Lib/typing.py" but nothing can say whether that file
// is still there, or where it moved to. So the worker makes sure the clone exists before it does
// any linking.
//
// The clone is blobless: the whole history, but the file contents only when they are needed. That
// is what makes `git log --follow` work without downloading gigabytes.

import { ensureCpythonRepository } from "@dejaview/linker";
import { isAbsolute, resolve } from "node:path";

/** Where the clone goes when CPYTHON_DIR is not set. It is inside data/, which is git-ignored. */
export const DEFAULT_CPYTHON_DIR = "./data/cpython";

export interface CpythonRepository {
  ok: boolean;
  /** The absolute path of the clone, or null when it could not be prepared. */
  path: string | null;
  /** True when this run made the clone, false when it was already there. */
  cloned: boolean;
  /** The directory we asked for, so the log can say where it went. */
  directory: string;
  error: string | null;
}

/**
 * Makes sure the CPython clone is there, and says where it is.
 * It never throws: a missing clone means the link job cannot do its job, and the worker
 * should say that clearly rather than fall over.
 */
export async function prepareCpythonRepository(
  directory: string | undefined = process.env.CPYTHON_DIR,
): Promise<CpythonRepository> {
  const wanted = directory?.trim() || DEFAULT_CPYTHON_DIR;
  const absolute = isAbsolute(wanted) ? wanted : resolve(process.cwd(), wanted);

  const result = await ensureCpythonRepository(absolute);
  if (!result.ok) {
    return {
      ok: false,
      path: result.path ?? null,
      cloned: false,
      directory: absolute,
      error: result.error ?? "The CPython clone could not be prepared",
    };
  }
  return {
    ok: true,
    path: result.path ?? absolute,
    cloned: result.cloned,
    directory: absolute,
    error: null,
  };
}
