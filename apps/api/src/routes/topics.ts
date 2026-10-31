// Topics: the list of decision areas, one topic, and its timeline.

import { Router } from "express";
import type { ApiContext } from "../context.js";

export function topicsRouter(context: ApiContext): Router {
  const router = Router();

  router.get("/topics", async (_req, res, next) => {
    try {
      res.json(await context.topics.listSummaries());
    } catch (error) {
      next(error);
    }
  });

  router.get("/topics/:slug", async (req, res, next) => {
    try {
      const slug = req.params.slug;
      const summaries = await context.topics.listSummaries();
      const summary = summaries.find((entry) => entry.slug === slug);
      if (!summary) {
        res.status(404).json({ error: `No topic named ${slug}` });
        return;
      }
      const sources = await context.topics.listSources(slug);
      const decisions = await context.decisions.listByTopic(slug);
      res.json({ ...summary, sources, decisions });
    } catch (error) {
      next(error);
    }
  });

  router.get("/topics/:slug/timeline", async (req, res, next) => {
    try {
      res.json(await context.timeline.forTopic(req.params.slug));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
