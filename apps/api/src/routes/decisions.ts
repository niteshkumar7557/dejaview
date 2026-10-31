// Decisions: search, the decision card, and the model calls behind it.

import { Router } from "express";
import { DECISION_STATUSES, type DecisionStatus } from "@dejaview/shared";
import type { ApiContext } from "../context.js";

function readStatus(value: unknown): DecisionStatus | null {
  if (typeof value !== "string") return null;
  return (DECISION_STATUSES as readonly string[]).includes(value)
    ? (value as DecisionStatus)
    : null;
}

export function decisionsRouter(context: ApiContext): Router {
  const router = Router();

  router.get("/decisions", async (req, res, next) => {
    try {
      const query = req.query as Record<string, unknown>;
      const decisions = await context.decisions.search({
        q: typeof query.q === "string" ? query.q : undefined,
        status: readStatus(query.status),
        topicSlug: typeof query.topic === "string" && query.topic ? query.topic : null,
        verifiedOnly: query.verified === "true",
        limit: 200,
      });
      res.json(decisions);
    } catch (error) {
      next(error);
    }
  });

  router.get("/decisions/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "The decision id must be a number" });
        return;
      }
      const card = await context.decisions.getCard(id);
      if (!card) {
        res.status(404).json({ error: `No decision with id ${id}` });
        return;
      }
      // Name the people, not just their handles: one human with two accounts is one name here.
      const postIds = card.reasons
        .flatMap((reason) => reason.evidence.map((evidence) => evidence.postId))
        .filter((postId) => postId > 0);
      const people = await context.identities.peopleForPosts(postIds);
      if (people.length > 0) {
        card.people = people.map((person) => person.displayName);
      }
      res.json(card);
    } catch (error) {
      next(error);
    }
  });

  router.get("/decisions/:id/llm-calls", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: "The decision id must be a number" });
        return;
      }
      res.json(await context.llmCalls.listForDecision(id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
