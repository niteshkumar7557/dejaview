// Starts the API.
//
//   npm run start -w @dejaview/api
//
// Needs DATABASE_URL. The model is not needed here: the API only queues work, the worker does
// the talking to the model.

import { mkdirSync } from "node:fs";
import { createApp } from "./app.js";
import { createContext, openPool } from "./context.js";
import { loadPrMatcher } from "./prMatcher.js";
import { UPLOAD_DIR } from "./paths.js";

const PORT = Number(process.env.PORT ?? 3001);

async function main(): Promise<void> {
  mkdirSync(UPLOAD_DIR, { recursive: true });

  const pool = openPool();
  const { matcher, fromLinker, reason } = await loadPrMatcher();
  if (!fromLinker) {
    console.warn(`PR matcher: ${reason} - using the simple matcher for now.`);
  }

  const context = createContext(pool, matcher, { apiToken: process.env.DEJAVIEW_API_TOKEN });
  const app = createApp(context);

  app.listen(PORT, () => {
    console.log(`DejaView API listening on http://localhost:${PORT}`);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
