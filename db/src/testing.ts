// A test database of its own, so tests never fight each other.
//
// Each test file gets its own Postgres schema. The tables are created inside that schema, so
// two files can run at the same time without seeing each other's rows.
//
//   const database = await createTestDatabase(databaseUrl, "dejaview_test_api");
//   const pool = database.pool;
//   ...
//   await database.drop();

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

/** Postgres takes the search path as a connection option. */
function withSearchPath(databaseUrl: string, schema: string): string {
  const separator = databaseUrl.includes("?") ? "&" : "?";
  return `${databaseUrl}${separator}options=${encodeURIComponent(`-c search_path=${schema}`)}`;
}

export interface TestDatabase {
  pool: Pool;
  /** Removes the schema again. */
  drop: () => Promise<void>;
}

export async function createTestDatabase(
  databaseUrl: string,
  schema: string,
): Promise<TestDatabase> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error(`"${schema}" is not a safe schema name`);
  }

  const admin = new Pool({ connectionString: databaseUrl });
  try {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: withSearchPath(databaseUrl, schema) });
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await pool.query(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }

  return {
    pool,
    drop: async () => {
      await pool.end();
      const cleaner = new Pool({ connectionString: databaseUrl });
      try {
        await cleaner.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await cleaner.end();
      }
    },
  };
}
