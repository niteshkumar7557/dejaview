// GET /api/health — is the database up, and can we reach the model on the laptop?

import { Router } from "express";
import type { ApiContext } from "../context.js";

async function llmIsReachable(): Promise<boolean> {
  const baseUrl = process.env.LLM_BASE_URL;
  if (!baseUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  try {
    const headers: Record<string, string> = {};
    const token = process.env.LLM_API_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      headers,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function healthRouter(context: ApiContext): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    let db = false;
    try {
      // Not just "is Postgres up" but "are our tables there".
      const result = await context.pool.query<{ ready: boolean }>(
        "SELECT to_regclass('public.jobs') IS NOT NULL AS ready",
      );
      db = result.rows[0]?.ready ?? false;
    } catch {
      db = false;
    }
    const llm = await llmIsReachable();
    res.json({ ok: db, db, llm });
  });

  return router;
}
