// The two parts of the team we call out to.
//
// The pipeline (Abhijeet) and the linker (Ansh) are separate packages. They are loaded when the
// worker starts. Until they are published the worker still does everything else: it fetches
// threads, stores them and queues the next step.

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
    deps: { llmStore: LlmCallStore },
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
}

export async function loadPipeline(): Promise<PipelineAdapter | null> {
  const specifier = "@dejaview/pipeline";
  try {
    const module = (await import(specifier)) as Partial<PipelineAdapter>;
    if (module.runExtraction && module.evaluatePep) {
      return {
        runExtraction: module.runExtraction,
        evaluatePep: module.evaluatePep,
      };
    }
  } catch {
    // The pipeline package is not there yet.
  }
  return null;
}

export async function loadLinker(): Promise<LinkerAdapter | null> {
  const specifier = "@dejaview/linker";
  try {
    const module = (await import(specifier)) as Partial<LinkerAdapter>;
    if (module.linkDecision) {
      return { linkDecision: module.linkDecision };
    }
  } catch {
    // The linker package is not there yet.
  }
  return null;
}
