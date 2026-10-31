// Places to keep model answers when there is no database: in memory (tests) or as files (the CLI),
// so a re-run never asks the model the same thing twice.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { LlmCallRecord, LlmCallStore } from "@dejaview/shared";

export function memoryLlmStore(): LlmCallStore & { records: Map<string, LlmCallRecord> } {
  const records = new Map<string, LlmCallRecord>();
  return {
    records,
    get: async (hash) => records.get(hash) ?? null,
    save: async (record) => {
      records.set(record.promptHash, record);
    },
  };
}

export function fileLlmStore(dir: string): LlmCallStore {
  return {
    async get(hash) {
      try {
        return JSON.parse(await readFile(join(dir, `${hash}.json`), "utf8")) as LlmCallRecord;
      } catch {
        return null;
      }
    },
    async save(record) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${record.promptHash}.json`), `${JSON.stringify(record, null, 2)}\n`, "utf8");
    },
  };
}
