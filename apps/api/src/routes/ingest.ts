// POST /api/ingest — the ingest form.
//
// The route only queues the work; the worker does the fetching, because a long thread can take
// a while and the browser should not have to wait for it.

import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { extname } from "node:path";
import { Router } from "express";
import multer from "multer";
import { parseDiscourseUrl, parseGithubUrl } from "@dejaview/ingest";
import type { ApiContext } from "../context.js";
import { UPLOAD_DIR } from "../paths.js";

/** A sensible topic slug when the caller did not give one. */
export function defaultSlugFor(url: string): string {
  const discourse = parseDiscourseUrl(url);
  if (discourse) return discourse.slug ?? `discourse-${discourse.topicId}`;
  const github = parseGithubUrl(url);
  if (github) return `gh-${github.owner}-${github.repo}-${github.number}`;
  return "upload";
}

export function ingestRouter(context: ApiContext): Router {
  const router = Router();
  // multer's plain "dest" option drops the file extension, and then a .md upload would be read
  // as plain text. The extension decides which reader we use, so it is kept.
  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
        cb(null, `${randomUUID()}${extension}`);
      },
    }),
  });

  router.post("/ingest", upload.single("file"), async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const topicSlug = typeof body.topicSlug === "string" ? body.topicSlug.trim() : "";
      const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle.trim() : "";
      const pepNumber =
        body.pepNumber === undefined || body.pepNumber === ""
          ? null
          : Number(body.pepNumber);
      const url = typeof body.url === "string" ? body.url.trim() : "";

      if (req.file) {
        if (!topicSlug) {
          res.status(400).json({ error: "topicSlug is required when uploading a file" });
          return;
        }
        const job = await context.jobs.enqueue("ingest", {
          filePath: req.file.path,
          topicSlug,
          topicTitle,
          pepNumber,
        });
        res.status(202).json({ jobId: job.id, topicSlug });
        return;
      }

      if (!url) {
        res.status(400).json({ error: "url is required" });
        return;
      }

      const slug = topicSlug || defaultSlugFor(url);
      const job = await context.jobs.enqueue("ingest", {
        url,
        topicSlug: slug,
        topicTitle,
        pepNumber,
      });
      res.status(202).json({ jobId: job.id, topicSlug: slug });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
