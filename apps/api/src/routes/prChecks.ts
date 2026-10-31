// The PR bot's side of the conversation.
//
// POST /api/pr-check is called by the GitHub Action. It needs the bearer token.
// GET  /api/pr-checks shows the log in the dashboard.

import { Router } from "express";
import type { PrCheckRequest, PrChangedFile } from "@dejaview/shared";
import type { ApiContext } from "../context.js";

function readFiles(value: unknown): PrChangedFile[] {
  if (!Array.isArray(value)) return [];
  const files: PrChangedFile[] = [];
  for (const entry of value) {
    if (entry && typeof entry === "object" && typeof (entry as PrChangedFile).path === "string") {
      const file = entry as PrChangedFile;
      files.push({
        path: file.path,
        previousPath: typeof file.previousPath === "string" ? file.previousPath : null,
      });
    }
  }
  return files;
}

function readSymbols(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((symbol): symbol is string => typeof symbol === "string");
}

export function prChecksRouter(context: ApiContext): Router {
  const router = Router();

  router.post("/pr-check", async (req, res, next) => {
    try {
      const expected = context.apiToken;
      if (expected) {
        const header = req.headers.authorization;
        if (header !== `Bearer ${expected}`) {
          res.status(401).json({ error: "Missing or wrong Authorization header" });
          return;
        }
      }

      const body = (req.body ?? {}) as Partial<PrCheckRequest>;
      if (typeof body.repo !== "string" || typeof body.prNumber !== "number") {
        res.status(400).json({ error: "repo and prNumber are required" });
        return;
      }

      const request: PrCheckRequest = {
        repo: body.repo,
        prNumber: body.prNumber,
        title: typeof body.title === "string" ? body.title : "",
        body: typeof body.body === "string" ? body.body : "",
        files: readFiles(body.files),
        symbols: readSymbols(body.symbols),
      };

      const candidates = await context.decisions.search({ limit: 500 });
      const matches = context.prMatcher.matchPr(request, candidates);
      const similarRejected = await context.decisions.similarRejected(
        `${request.title} ${request.body}`.slice(0, 2000),
        5,
      );
      const commentMarkdown = context.prMatcher.renderPrComment(
        matches,
        similarRejected,
        context.dashboardUrl,
      );

      await context.prChecks.save({
        repo: request.repo,
        prNumber: request.prNumber,
        title: request.title,
        matchedDecisionIds: matches.map((match) => match.id),
        similarRejectedIds: similarRejected.map((match) => match.id),
        commentBody: commentMarkdown,
      });

      res.json({ decisions: matches, similarRejected, commentMarkdown });
    } catch (error) {
      next(error);
    }
  });

  router.get("/pr-checks", async (_req, res, next) => {
    try {
      res.json(await context.prChecks.list());
    } catch (error) {
      next(error);
    }
  });

  return router;
}
