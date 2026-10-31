import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";
import {
  callLlm,
  createPromptHash,
  contextWarning,
  joinOllamaStream,
  readOllamaStream,
  type LlmClientDependencies,
} from "../../src/llm/client.js";

const model = "qwen-test";
const prompt = "Extract the decision.";
const jsonSchema = {
  type: "object",
  properties: { answer: { type: "string" } },
  required: ["answer"],
  additionalProperties: false,
};
const responseSchema = z.object({ answer: z.string() });
const expected = { answer: "rejected" };

const temporaryDirectories: string[] = [];

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "dejaview-llm-test-"));
  temporaryDirectories.push(path);
  return path;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

function makeStore(initial: LlmCallRecord | null = null) {
  let saved: LlmCallRecord | null = initial;

  const store: LlmCallStore = {
    get: vi.fn(async () => saved),
    save: vi.fn(async (record: LlmCallRecord) => {
      saved = record;
    }),
  };

  return { store, getSaved: () => saved };
}

function makeFetch(content: string) {
  return vi.fn<typeof fetch>(async () =>
    new Response(
      JSON.stringify({ message: { content } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

function options(deps: LlmClientDependencies) {
  return {
    model,
    stage: "triage" as const,
    prompt,
    jsonSchema,
    responseSchema,
    deps,
  };
}

describe("joinOllamaStream", () => {
  it("joins a streamed answer, one JSON object per line", () => {
    const raw = ['{"message":{"content":"{\\"a\\":"}}', '{"message":{"content":"1}"}}', '{"done":true}', ""].join("\n");
    expect(joinOllamaStream(raw)).toBe('{"a":1}');
  });
  it("accepts a single non-streamed object", () => {
    expect(joinOllamaStream('{"message":{"content":"ok"}}')).toBe("ok");
  });
  it("surfaces an error line from Ollama", () => {
    expect(() => joinOllamaStream('{"error":"model not found"}')).toThrow("Ollama error: model not found");
  });
});

describe("contextWarning", () => {
  it("reads the prompt token count and stop reason from the last streamed line", () => {
    const raw = '{"message":{"content":"x"}}\n{"done":true,"done_reason":"stop","prompt_eval_count":812}';
    expect(readOllamaStream(raw)).toEqual({ content: "x", promptTokens: 812, doneReason: "stop" });
  });
  it("warns when the answer was cut off or the prompt filled the window, and stays quiet otherwise", () => {
    expect(contextWarning({ content: "", promptTokens: 100, doneReason: "length" }, "extract")).toMatch(/cut off/);
    expect(contextWarning({ content: "", promptTokens: 8000, doneReason: "stop" }, "extract")).toMatch(/8000 of 8192/);
    expect(contextWarning({ content: "", promptTokens: 3000, doneReason: "stop" }, "extract")).toBeNull();
  });
});

describe("createPromptHash", () => {
  it("is deterministic and changes when model, schema, or prompt changes", () => {
    const hash = createPromptHash(model, jsonSchema, prompt);

    expect(hash).toBe(createPromptHash(model, jsonSchema, prompt));
    expect(hash).not.toBe(createPromptHash("other-model", jsonSchema, prompt));
    expect(hash).not.toBe(
      createPromptHash(model, { type: "string" }, prompt),
    );
    expect(hash).not.toBe(
      createPromptHash(model, jsonSchema, "Different prompt"),
    );
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not depend on JSON schema object key order", () => {
    expect(
      createPromptHash(model, { type: "object", properties: { a: { type: "string" } } }, prompt),
    ).toBe(
      createPromptHash(model, { properties: { a: { type: "string" } }, type: "object" }, prompt),
    );
  });
});

describe("callLlm", () => {
  it("sends the required Ollama request and saves the validated response", async () => {
    const { store, getSaved } = makeStore();
    const fetchImpl = makeFetch(JSON.stringify(expected));

    const result = await callLlm(
      options({
        llmStore: store,
        mode: "live",
        baseUrl: "http://localhost:11434/",
        apiToken: "test-token",
        fetchImpl,
      }),
    );

    expect(result).toEqual(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/api/chat");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.model).toBe(model);
    expect(body.messages).toEqual([{ role: "user", content: prompt }]);
    expect(body.format).toEqual(jsonSchema);
    expect(body.think).toBe(false);
    expect(body.options).toEqual({ temperature: 0, num_ctx: 8192, num_predict: 2500 });
    expect(body.stream).toBe(true);

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(getSaved()).toMatchObject({
      promptHash: createPromptHash(model, jsonSchema, prompt),
      model,
      stage: "triage",
      prompt,
      response: expected,
    });
  });

  it("uses a cached response without making a request", async () => {
    const cached: LlmCallRecord = {
      promptHash: createPromptHash(model, jsonSchema, prompt),
      model,
      stage: "triage",
      prompt,
      response: expected,
      durationMs: 12,
    };
    const { store } = makeStore(cached);
    const fetchImpl = makeFetch(JSON.stringify({ answer: "unexpected" }));

    const result = await callLlm(
      options({ llmStore: store, mode: "live", fetchImpl }),
    );

    expect(result).toEqual(expected);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it("rejects a cached response that fails schema validation", async () => {
    const cached: LlmCallRecord = {
      promptHash: createPromptHash(model, jsonSchema, prompt),
      model,
      stage: "triage",
      prompt,
      response: { wrong: true },
      durationMs: 12,
    };
    const { store } = makeStore(cached);

    await expect(
      callLlm(options({ llmStore: store, mode: "live" })),
    ).rejects.toThrow();
  });

  it("retries a failed request with exponential backoff", async () => {
    const { store } = makeStore();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ message: { content: JSON.stringify(expected) } }),
          { status: 200 },
        ),
      );
    const sleep = vi.fn(async (_ms: number) => {});

    const result = await callLlm(
      options({
        llmStore: store,
        mode: "live",
        apiToken: "test-token",
        fetchImpl,
        sleep,
        retryDelayMs: 100,
      }),
    );

    expect(result).toEqual(expected);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it("fails clearly when the API token is missing", async () => {
    const { store } = makeStore();
    const fetchImpl = makeFetch(JSON.stringify(expected));

    await expect(
      callLlm(
        options({
          llmStore: store,
          mode: "live",
          apiToken: "",
          fetchImpl,
        }),
      ),
    ).rejects.toThrow("LLM_API_TOKEN is required");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("records a response as a fixture and replays it without network or store access", async () => {
    const fixtureDir = await makeTempDir();
    const first = makeStore();
    const fetchImpl = makeFetch(JSON.stringify(expected));

    const recorded = await callLlm(
      options({
        llmStore: first.store,
        mode: "record",
        apiToken: "test-token",
        fetchImpl,
        fixtureDir,
      }),
    );

    expect(recorded).toEqual(expected);

    const hash = createPromptHash(model, jsonSchema, prompt);
    const fixture = JSON.parse(
      await readFile(join(fixtureDir, `${hash}.json`), "utf8"),
    ) as LlmCallRecord;

    expect(fixture.promptHash).toBe(hash);
    expect(fixture.response).toEqual(expected);

    const replayStore = makeStore();
    const replayFetch = makeFetch(JSON.stringify({ answer: "should not run" }));

    const replayed = await callLlm(
      options({
        llmStore: replayStore.store,
        mode: "replay",
        fetchImpl: replayFetch,
        fixtureDir,
      }),
    );

    expect(replayed).toEqual(expected);
    expect(replayFetch).not.toHaveBeenCalled();
    expect(replayStore.store.get).not.toHaveBeenCalled();
    expect(replayStore.store.save).not.toHaveBeenCalled();
  });

  it("fails loudly when a replay fixture is missing", async () => {
    const fixtureDir = await makeTempDir();
    const { store } = makeStore();
    const fetchImpl = makeFetch(JSON.stringify(expected));

    await expect(
      callLlm(
        options({
          llmStore: store,
          mode: "replay",
          fetchImpl,
          fixtureDir,
        }),
      ),
    ).rejects.toThrow("Replay fixture missing");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  });

  it("does not repeat the model request when saving the response fails", async () => {
    const store: LlmCallStore = {
      get: vi.fn(async () => null),
      save: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    };
    const fetchImpl = makeFetch(JSON.stringify(expected));

    await expect(
      callLlm(
        options({
          llmStore: store,
          mode: "live",
          apiToken: "test-token",
          fetchImpl,
          sleep: vi.fn(async () => {}),
        }),
      ),
    ).rejects.toThrow("database unavailable");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });


  it("rejects a cached record with a mismatched prompt hash", async () => {
    const cached: LlmCallRecord = {
      promptHash: "0".repeat(64),
      model,
      stage: "triage",
      prompt,
      response: expected,
      durationMs: 12,
    };
    const { store } = makeStore(cached);

    await expect(
      callLlm(options({ llmStore: store, mode: "live" })),
    ).rejects.toThrow(/cached.*hash|hash.*cached/i);
  });

  it("rejects a replay fixture whose stored prompt was changed", async () => {
    const fixtureDir = await makeTempDir();
    const hash = createPromptHash(model, jsonSchema, prompt);
    const fixture: LlmCallRecord = {
      promptHash: hash,
      model,
      stage: "triage",
      prompt: "A different prompt",
      response: expected,
      durationMs: 12,
    };

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(
        join(fixtureDir, `${hash}.json`),
        JSON.stringify(fixture),
        "utf8",
      ),
    );

    await expect(
      callLlm(
        options({
          llmStore: makeStore().store,
          mode: "replay",
          fixtureDir,
        }),
      ),
    ).rejects.toThrow(/prompt/i);
  });

  it("rejects a negative retry count before making a request", async () => {
    const { store } = makeStore();
    const fetchImpl = makeFetch(JSON.stringify(expected));

    await expect(
      callLlm(
        options({
          llmStore: store,
          mode: "live",
          apiToken: "test-token",
          maxRetries: -1,
          fetchImpl,
        }),
      ),
    ).rejects.toThrow(/maxRetries/i);

    expect(fetchImpl).not.toHaveBeenCalled();
  });

});

describe("callLlm reusing a recorded answer in live mode", () => {
  it("answers from fixtures/llm without calling the model, and saves it to the store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dejaview-fixture-"));
    try {
      const schema = { type: "object" };
      const hash = createPromptHash("m", schema, "p");
      const record = { promptHash: hash, model: "m", stage: "extract", prompt: "p", response: { ok: true }, durationMs: 5 };
      const { writeFile } = await import("node:fs/promises");
      await writeFile(join(dir, `${hash}.json`), JSON.stringify(record));
      const saved: unknown[] = [];
      const result = await callLlm({
        model: "m", stage: "extract", prompt: "p", jsonSchema: schema, responseSchema: z.object({ ok: z.boolean() }),
        deps: {
          mode: "live", fixtureDir: dir, apiToken: "t",
          llmStore: { get: async () => null, save: async (r) => { saved.push(r); } },
          fetchImpl: (async () => { throw new Error("must not call the model"); }) as unknown as typeof fetch,
        },
      });
      expect(result).toEqual({ ok: true });
      expect(saved).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("callLlm when the answer is cut off for length", () => {
  it("does not retry: the same prompt at temperature 0 would be cut off again", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('{"message":{"content":"{\\"a\\":"}}\n{"done":true,"done_reason":"length"}', { status: 200 });
    }) as unknown as typeof fetch;
    await expect(callLlm({
      model: "m", stage: "extract", prompt: "p-length", jsonSchema: { type: "object" }, responseSchema: z.object({ a: z.number() }),
      deps: { mode: "live", apiToken: "t", fetchImpl, maxRetries: 2, retryDelayMs: 0, sleep: async () => {},
        llmStore: { get: async () => null, save: async () => {} } },
    })).rejects.toThrow(/cut off/);
    expect(calls).toBe(1);
  });
});
