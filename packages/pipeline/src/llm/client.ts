import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";
import { z } from "zod";

export type LlmMode = "live" | "record" | "replay";

type LlmStage = LlmCallRecord["stage"];

export interface LlmClientDependencies {
  llmStore: LlmCallStore;
  mode?: LlmMode;
  baseUrl?: string;
  apiToken?: string;
  fixtureDir?: string;
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

export interface CallLlmOptions<T> {
  model: string;
  stage: LlmStage;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  responseSchema: z.ZodType<T>;
  deps: LlmClientDependencies;
}

const ollamaResponseSchema = z.object({
  message: z.object({
    content: z.string(),
  }),
});

const defaultFixtureDir = fileURLToPath(
  new URL("../../../../fixtures/llm/", import.meta.url),
);

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;

    const entries = Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(object[key])}`,
      );

    return `{${entries.join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createPromptHash(
  model: string,
  jsonSchema: Record<string, unknown>,
  prompt: string,
): string {
  const input = JSON.stringify([
    model,
    stableStringify(jsonSchema),
    prompt,
  ]);

  return createHash("sha256").update(input).digest("hex");
}

function getMode(deps: LlmClientDependencies): LlmMode {
  const mode = deps.mode ?? process.env.LLM_MODE ?? "live";

  if (mode !== "live" && mode !== "record" && mode !== "replay") {
    throw new Error(`Invalid LLM_MODE: ${mode}`);
  }

  return mode;
}

function parseModelOutput<T>(
  content: string,
  schema: z.ZodType<T>,
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Ollama returned invalid JSON.");
  }

  return schema.parse(parsed);
}

async function readFixture(
  hash: string,
  fixtureDir: string,
  expected: { model: string; stage: LlmStage; prompt: string },
): Promise<LlmCallRecord> {
  const path = join(fixtureDir, `${hash}.json`);

  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      throw new Error(`Replay fixture missing: ${path}`);
    }

    throw error;
  }

  const record: unknown = JSON.parse(content);

  const fixtureSchema = z.object({
    promptHash: z.string(),
    model: z.string(),
    stage: z.string(),
    prompt: z.string(),
    response: z.unknown(),
    durationMs: z.number(),
  });

  const validated = fixtureSchema.parse(record);

  if (
    validated.promptHash !== hash ||
    validated.model !== expected.model ||
    validated.stage !== expected.stage ||
    validated.prompt !== expected.prompt
  ) {
    throw new Error("Replay fixture hash, model, stage, or prompt does not match.");
  }

  return validated as LlmCallRecord;
}

async function writeFixture(
  record: LlmCallRecord,
  fixtureDir: string,
): Promise<void> {
  await mkdir(fixtureDir, { recursive: true });

  const path = join(fixtureDir, `${record.promptHash}.json`);
  const temporaryPath = `${path}.${process.pid}.tmp`;

  await writeFile(
    temporaryPath,
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );

  await rename(temporaryPath, path);
}

export async function callLlm<T>(
  options: CallLlmOptions<T>,
): Promise<T> {
  const {
    model,
    stage,
    prompt,
    jsonSchema,
    responseSchema,
    deps,
  } = options;

  const mode = getMode(deps);

  const hash = createPromptHash(model, jsonSchema, prompt);

  const fixtureDir = deps.fixtureDir ?? defaultFixtureDir;

  // Replay mode must never access Ollama or the database cache.
  if (mode === "replay") {
    const record = await readFixture(hash, fixtureDir, { model, stage, prompt });

    if (record.model !== model || record.stage !== stage) {
      throw new Error("Replay fixture model or stage does not match.");
    }

    return responseSchema.parse(record.response);
  }

  // Live and record modes can reuse previously stored responses.
  const cached = await deps.llmStore.get(hash);

  if (cached !== null) {
    if (
      cached.promptHash !== hash ||
      cached.model !== model ||
      cached.stage !== stage ||
      cached.prompt !== prompt
    ) {
      throw new Error("Cached LLM record hash, model, stage, or prompt does not match.");
    }

    const result = responseSchema.parse(cached.response);

    if (mode === "record") {
      await writeFixture(cached, fixtureDir);
    }

    return result;
  }

  const baseUrl =
    deps.baseUrl ?? process.env.LLM_BASE_URL ?? "http://localhost:11434";

  const apiToken = deps.apiToken ?? process.env.LLM_API_TOKEN;

  if (!apiToken) {
    throw new Error("LLM_API_TOKEN is required in live and record modes.");
  }

  const timeoutMs = deps.timeoutMs ?? 60_000;
  const maxRetries = deps.maxRetries ?? 2;
  const retryDelayMs = deps.retryDelayMs ?? 250;

  if (!Number.isInteger(maxRetries) || maxRetries < 0) {
    throw new Error("maxRetries must be a non-negative integer.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be a positive finite number.");
  }

  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0) {
    throw new Error("retryDelayMs must be a non-negative finite number.");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;

  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, ms)));

  let lastError: unknown;
  let successfulRecord: LlmCallRecord | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const startedAt = Date.now();

    try {
      const response = await fetchImpl(
        `${baseUrl.replace(/\/+$/, "")}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiToken}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            format: jsonSchema,
            think: false,
            options: {
              temperature: 0,
              num_ctx: 8192,
            },
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Ollama HTTP error: ${response.status} ${response.statusText}`,
        );
      }

      const rawResponse: unknown = await response.json();
      const envelope = ollamaResponseSchema.parse(rawResponse);
      const result = parseModelOutput(
        envelope.message.content,
        responseSchema,
      );

      successfulRecord = {
        promptHash: hash,
        model,
        stage,
        prompt,
        response: result,
        durationMs: Date.now() - startedAt,
      };

      break;
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await sleep(retryDelayMs * 2 ** attempt);
      }
    }
  }

  if (successfulRecord === null) {
    throw new Error(
      `LLM request failed after ${maxRetries + 1} attempts: ${
        lastError instanceof Error
          ? lastError.message
          : String(lastError)
      }`,
      { cause: lastError },
    );
  }

  // Persistence failures must not trigger another model request.
  await deps.llmStore.save(successfulRecord);

  if (mode === "record") {
    await writeFixture(successfulRecord, fixtureDir);
  }

  return responseSchema.parse(successfulRecord.response);
}
