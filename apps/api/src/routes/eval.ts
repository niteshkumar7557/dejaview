// The self-evaluation scorecard: run one and list the ones we have.

import { Router } from "express";
import type { ApiContext } from "../context.js";

export function evalRouter(context: ApiContext): Router {
  const router = Router();

  router.post("/eval/:slug", async (req, res, next) => {
    try {
      const slug = req.params.slug;
      const topic = await context.topics.getBySlug(slug);
      if (!topic) {
        res.status(404).json({ error: `No topic named ${slug}` });
        return;
      }
      // The evaluation needs the model, so it runs in the worker, not here.
      const job = await context.jobs.enqueue("eval", { topicSlug: slug, pepNumber: topic.pep_number });
      res.status(202).json({ jobId: job.id, topicSlug: slug });
    } catch (error) {
      next(error);
    }
  });

  router.get("/eval", async (_req, res, next) => {
    try {
      res.json(await context.evalRuns.list());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
