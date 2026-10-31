"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "./errors";
import { jobOutcome, nextJobToFollow, type JobWithNext } from "./ingest";
import { getSource } from "./source";

const POLL_MS = 1000;

/**
 * Follows one job of the worker until it ends. Used by the ingest form and the "Run evaluation" button.
 *
 * - Polls GET /api/jobs/:id every second while the job runs; a failed poll is shown and retried.
 * - When a finished job names the next job of the chain (`nextJobId`), it follows that one.
 * - Stops when the API no longer knows the job (`lost`), instead of polling forever.
 */
export function useJob() {
  const [job, setJob] = useState<JobWithNext | null>(null);
  const [lost, setLost] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  // Bumped after a failed poll so the effect schedules a retry even if the error text is unchanged.
  const [retry, setRetry] = useState(0);

  const follow = useCallback(async (id: number) => {
    setLost(false);
    setPollError(null);
    const first = await getSource().getJob(id);
    if (first) setJob(first);
    else setLost(true);
  }, []);

  const reset = useCallback(() => {
    setJob(null);
    setLost(false);
    setPollError(null);
  }, []);

  useEffect(() => {
    if (!job || lost) return;
    const next = nextJobToFollow(job);
    if (next !== null) {
      void follow(next).catch((e: unknown) => setPollError(errorMessage(e)));
      return;
    }
    if (jobOutcome(job) !== "running") return;
    const timer = setTimeout(async () => {
      try {
        const fresh = await getSource().getJob(job.id);
        setPollError(null);
        if (fresh) setJob(fresh);
        else setLost(true);
      } catch (e) {
        setPollError(`${errorMessage(e)} Retrying every second.`);
        setRetry((n) => n + 1);
      }
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [job, lost, retry, follow]);

  return { job, lost, pollError, follow, reset };
}
