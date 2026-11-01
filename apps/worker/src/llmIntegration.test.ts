// The model call and the audit trail, together.
//
// The pipeline's LLM client (Abhijeet's) writes every call through the LlmCallStore from the
// shared contract. The database implementation of that store is mine. This test puts the two
// together and checks that a call really lands in the llm_calls table, with the prompt, the
// answer and how long it took, and that the same call is served from there the second time.
//
// The test skips until packages/pipeline exports callLlm from its index.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { Pool } from "pg";
import { createTestDatabase, PostgresLlmCallStore, type TestDatabase } from "@dejaview/db";

const databaseUrl = process.env.DATABASE_URL;

const pipelineModule = await import("@dejaview/pipeline").catch(() => null);
const callLlm = (pipelineModule as { callLlm?: unknown } | null)?.callLlm as
  | ((options: Record<string, unknown>) => Promise<unknown>)
  | undefined;

const answerSchema = z.object({ idea: z.string(), reason: z.string() });

/** A fake Ollama, so the test never needs the model or the network. */
function fakeOllama(content: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ message: { content } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
}

// The test needs two things: a database to hold the audit trail, and the pipeline to export
// callLlm. Checking only for callLlm meant that without DATABASE_URL the suite tried to open a
// connection to a host named "base" and failed the file instead of skipping it.
describe.skipIf(!databaseUrl || !callLlm)("the model call and the audit trail (needs DATABASE_URL)", () => {
  let pool: Pool;
  let database: TestDatabase;
  let store: PostgresLlmCallStore;

  beforeAll(async () => {
    database = await createTestDatabase(databaseUrl ?? "", "dejaview_test_llm");
    pool = database.pool;
    store = new PostgresLlmCallStore(pool);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM llm_calls");
    await database.drop();
  });

  it("stores the prompt, the answer and the time in llm_calls", async () => {
    const prompt = "Which of these ideas was rejected, and why?";
    const result = await callLlm!({
      model: "qwen3.5:9b",
      stage: "extract",
      prompt,
      jsonSchema: { type: "object", properties: { idea: { type: "string" }, reason: { type: "string" } } },
      responseSchema: answerSchema,
      deps: {
        llmStore: store,
        mode: "live",
        // The client insists on a token even when the fetch is faked.
        apiToken: "test-token",
        fetchImpl: fakeOllama(JSON.stringify({ idea: "Use a list", reason: "it breaks old code" })),
      },
    });

    expect(result).toEqual({ idea: "Use a list", reason: "it breaks old code" });

    const row = await pool.query<{
      model: string;
      stage: string;
      prompt: string;
      response: unknown;
      duration_ms: number | null;
    }>("SELECT model, stage, prompt, response, duration_ms FROM llm_calls ORDER BY id DESC LIMIT 1");

    expect(row.rows[0]?.model).toBe("qwen3.5:9b");
    expect(row.rows[0]?.stage).toBe("extract");
    expect(row.rows[0]?.prompt).toBe(prompt);
    expect(row.rows[0]?.response).toEqual({ idea: "Use a list", reason: "it breaks old code" });
    expect(row.rows[0]?.duration_ms).not.toBeNull();
  });

  it("serves the same call from the store instead of asking the model again", async () => {
    const prompt = "Which of these ideas was rejected, and why?";
    let asked = 0;
    const counting = async () => {
      asked += 1;
      return new Response(
        JSON.stringify({ message: { content: JSON.stringify({ idea: "x", reason: "y" }) } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const options = {
      model: "qwen3.5:9b",
      stage: "extract" as const,
      prompt,
      jsonSchema: { type: "object" },
      responseSchema: answerSchema,
      deps: {
        llmStore: store,
        mode: "live" as const,
        apiToken: "test-token",
        fetchImpl: counting,
      },
    };

    await callLlm!(options);
    const askedAfterFirst = asked;
    await callLlm!(options);

    // The second call came from the store, so the model was not asked a second time.
    expect(askedAfterFirst).toBe(1);
    expect(asked).toBe(1);
  });
});
