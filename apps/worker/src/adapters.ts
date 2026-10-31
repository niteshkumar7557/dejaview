// The two parts of the team we call out to.
//
// The pipeline (Abhijeet) and the linker (Ansh) are separate packages. They are loaded when the
// worker starts. Until they are published the worker still does everything else: it fetches
// threads, stores them and queues the next step.
//
// The loading tells apart the two reasons a package can be missing, because they need different
// fixes:
//
//   "not installed" — the package is on disk but npm has not linked it. The fix is `npm install`.
//   "not published" — the package is not on disk at all. Somebody still has to write it.
//
// Saying the wrong one sends the team down the wrong path, so we check the disk.

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type {
  CodeAnchor,
  EvalResult,
  ExtractedDecision,
  ExtractionResult,
  LlmCallStore,
  ProgressReporter,
  Thread,
  ThreadPost,
} from "@dejaview/shared";

export interface PipelineAdapter {
  runExtraction(
    thread: Thread,
    deps: { llmStore: LlmCallStore; onProgress?: ProgressReporter },
  ): Promise<ExtractionResult>;
  evaluatePep(
    pepNumber: number,
    result: ExtractionResult,
    deps: { llmCallStore?: LlmCallStore; llmStore?: LlmCallStore },
  ): Promise<EvalResult>;
}

export interface LinkerContext {
  repoDir: string;
  repo: string;
  githubToken?: string | undefined;
}

export interface LinkerAdapter {
  linkDecision(
    decision: ExtractedDecision,
    posts: ThreadPost[],
    ctx: LinkerContext,
  ): Promise<CodeAnchor[]>;
  /** Fills in current_path and relocated_by when a file has moved since the decision. */
  relocateAnchor(anchor: CodeAnchor, repoDir: string): Promise<CodeAnchor>;
}

/** Why a package could not be loaded. */
export type LoadProblem = "ok" | "not-installed" | "not-published" | "wrong-exports";

export interface Loaded<T> {
  adapter: T | null;
  problem: LoadProblem;
  /** A sentence the team can act on. */
  reason: string;
}

function packageFolder(name: string): string {
  return fileURLToPath(new URL(`../../../packages/${name}/`, import.meta.url));
}

/** Whether the package is on disk, and therefore whether npm can link it. */
function isOnDisk(name: string): boolean {
  return existsSync(packageFolder(name));
}

export async function loadPipeline(): Promise<Loaded<PipelineAdapter>> {
  const name = "pipeline";
  const specifier = "@dejaview/pipeline";
  if (!isOnDisk(name)) {
    return {
      adapter: null,
      problem: "not-published",
      reason: `packages/${name} is not written yet - ask Abhijeet for the extract job`,
    };
  }
  try {
    const module = (await import(specifier)) as Partial<PipelineAdapter>;
    if (!module.runExtraction || !module.evaluatePep) {
      return {
        adapter: null,
        problem: "wrong-exports",
        reason: `packages/${name} does not export runExtraction and evaluatePep yet - ask Abhijeet`,
      };
    }
    return {
      adapter: {
        runExtraction: module.runExtraction,
        evaluatePep: module.evaluatePep,
      },
      problem: "ok",
      reason: "loaded",
    };
  } catch {
    return {
      adapter: null,
      problem: "not-installed",
      reason: `packages/${name} is on disk but not linked - run npm install`,
    };
  }
}

export async function loadLinker(): Promise<Loaded<LinkerAdapter>> {
  const name = "linker";
  const specifier = "@dejaview/linker";
  if (!isOnDisk(name)) {
    return {
      adapter: null,
      problem: "not-published",
      reason: `packages/${name} is not written yet - ask Ansh for the link job`,
    };
  }
  try {
    const module = (await import(specifier)) as Partial<LinkerAdapter>;
    if (!module.linkDecision || !module.relocateAnchor) {
      return {
        adapter: null,
        problem: "wrong-exports",
        reason: `packages/${name} does not export linkDecision and relocateAnchor yet - ask Ansh`,
      };
    }
    return {
      adapter: {
        linkDecision: module.linkDecision,
        relocateAnchor: module.relocateAnchor,
      },
      problem: "ok",
      reason: "loaded",
    };
  } catch {
    return {
      adapter: null,
      problem: "not-installed",
      reason: `packages/${name} is on disk but not linked - run npm install`,
    };
  }
}
