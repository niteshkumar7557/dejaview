import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";
import {
  callLlm,
  createPromptHash,
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
    expect(body.options).toEqual({ temperature: 0, num_ctx: 8192 });
    expect(body.stream).toBe(false);

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
