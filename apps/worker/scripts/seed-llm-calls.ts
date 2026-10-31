// Puts the recorded model answers into the audit trail.
//
// The fixtures in fixtures/llm/ are what the model actually answered, recorded with the prompt
// and the time it took. The llm_calls table is the audit trail: "here is exactly what the model
// was shown and here is what it said". Loading the recordings into it means the audit trail has
// the same answers the pipeline will use, and the worker can serve them from the store.
//
//   npm run seed-llm-calls -w @dejaview/worker
//
// This is the same thing the "record" mode writes when it talks to the model. It only reads
// files that were recorded from the model, it never invents an answer.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createPool } from "@dejaview/db";

const FIXTURE_DIR = fileURLToPath(new URL("../../../fixtures/llm/", import.meta.url));

interface Fixture {
  promptHash: string;
  model: string;
  stage: string;
  prompt: string;
  response: unknown;
  durationMs: number;
}

async function main(): Promise<void> {
  const pool = createPool();
  try {
    const files = readdirSync(FIXTURE_DIR).filter((name) => name.endsWith(".json"));
    let loaded = 0;
    for (const file of files) {
      const fixture = JSON.parse(readFileSync(join(FIXTURE_DIR, file), "utf8")) as Fixture;
      const result = await pool.query(
        `INSERT INTO llm_calls (job_id, prompt_hash, model, stage, prompt, response, duration_ms)
              VALUES (NULL, $1, $2, $3, $4, $5::jsonb, $6)
         ON CONFLICT (prompt_hash) DO NOTHING`,
        [
          fixture.promptHash,
          fixture.model,
          fixture.stage,
          fixture.prompt,
          JSON.stringify(fixture.response ?? null),
          fixture.durationMs,
        ],
      );
      if (result.rowCount && result.rowCount > 0) loaded += 1;
    }

    const total = await pool.query<{ count: string }>("SELECT count(*) FROM llm_calls");
    console.log(
      `loaded ${loaded} recorded answers into llm_calls (the table now holds ${total.rows[0]?.count})`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
