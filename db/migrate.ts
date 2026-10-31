// Migration runner.
//
//   npm run migrate            (DATABASE_URL must point at a Postgres)
//
// It applies every .sql file in db/migrations/ that has not been applied yet, each one in its
// own transaction, and remembers what it did in the schema_migrations table. Running it twice
// does nothing the second time.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("./migrations/", import.meta.url));

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Example: postgres://dejaview:dejaview@localhost:5432/dejaview");
    process.exitCode = 2;
    return;
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         filename   TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ DEFAULT now()
       )`,
    );

    const appliedResult = await client.query<{ filename: string }>("SELECT filename FROM schema_migrations");
    const applied = new Set(appliedResult.rows.map((row) => row.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    if (files.length === 0) {
      console.log("No migration files found.");
      return;
    }

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`skip    ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log(`applied ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
