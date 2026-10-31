// The Express app. createApp() returns the app so the tests can call it with supertest,
// and server.ts is the thing that actually listens on a port.

import express, { type Express } from "express";
import cors from "cors";
import type { ApiContext } from "./context.js";
import { decisionsRouter } from "./routes/decisions.js";
import { evalRouter } from "./routes/eval.js";
import { healthRouter } from "./routes/health.js";
import { ingestRouter } from "./routes/ingest.js";
import { jobsRouter } from "./routes/jobs.js";
import { prChecksRouter } from "./routes/prChecks.js";
import { topicsRouter } from "./routes/topics.js";

export function createApp(context: ApiContext): Express {
  const app = express();

  // The dashboard runs on a different origin, so it needs CORS.
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", ingestRouter(context));
  app.use("/api", jobsRouter(context));
  app.use("/api", topicsRouter(context));
  app.use("/api", decisionsRouter(context));
  app.use("/api", evalRouter(context));
  app.use("/api", prChecksRouter(context));
  app.use("/api", healthRouter(context));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Something went wrong" });
  });

  return app;
}
