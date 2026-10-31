// GET /api/jobs/:id — how far along the ingest is. The web app polls this.

import { Router } from "express";
import type { ApiContext } from "../context.js";

export function jobsRouter(context: ApiContext): Router {
  const router = Router();

  router.get("/jobs/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "The job id must be a number" });
        return;
      }
      const job = await context.jobs.getById(id);
      if (!job) {
        res.status(404).json({ error: `No job with id ${id}` });
        return;
      }
      res.json({
        id: job.id,
        type: job.type,
        status: job.status,
        stage: job.stage,
        progress: job.progress,
        error: job.error,
        createdAt: job.created_at.toISOString(),
        updatedAt: job.updated_at.toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
