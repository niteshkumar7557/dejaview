// The one function the stages use to ask a model something. It hides callLlm's plumbing so each
// stage only says: which model, which stage, the prompt, the JSON shape it wants back.
// Tests pass a fake Ask instead, so the stages can be tested without a model.

import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";
import type { z } from "zod";
import { callLlm, type LlmClientDependencies } from "./client.js";

export interface AskOptions<T> {
  model: string;
  stage: LlmCallRecord["stage"];
  prompt: string;
  jsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
}

export type Ask = <T>(options: AskOptions<T>) => Promise<T>;

/**
 * How long one model call may take. The 9B on the team laptop (4 GB GPU) writes a few words per
 * second, so a full extraction answer takes minutes; the client's 60 s default would cut it off and
 * retry from scratch. LLM_TIMEOUT_MS overrides it.
 */
export function llmTimeoutMs(): number {
  const fromEnv = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 15 * 60 * 1000;
}

export function createAsk(llmStore: LlmCallStore, overrides: Partial<LlmClientDependencies> = {}): Ask {
  return (options) => callLlm({ ...options, deps: { llmStore, timeoutMs: llmTimeoutMs(), ...overrides } });
}
