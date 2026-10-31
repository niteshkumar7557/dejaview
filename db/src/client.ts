// The one place that talks to Postgres.
//
// Everything uses parameterised queries ($1, $2, ...) and never builds SQL by pasting strings
// together. That is both safer and easier to read.

import { Pool, type PoolClient } from "pg";

export function createPool(connectionString: string | undefined = process.env.DATABASE_URL): Pool {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  return new Pool({ connectionString, max: 10 });
}

/** Runs a function inside one transaction: it commits on success and rolls back on any error. */
export async function withTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
