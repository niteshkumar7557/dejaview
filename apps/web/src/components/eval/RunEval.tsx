"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { formatPercent } from "@/lib/format";
import { jobOutcome } from "@/lib/ingest";
import { getSource } from "@/lib/source";
import { useJob } from "@/lib/use-job";
import { Button } from "../ui/Button";
import styles from "./eval.module.css";

/**
 * Starts an evaluation (POST /api/eval/:slug) for one topic that has a PEP, follows the job,
 * and reloads the scorecard when it finishes. Only topics with a PEP number can be evaluated.
 */
export function RunEval({ topics }: { topics: { slug: string; title: string; pepNumber: number }[] }) {
  const router = useRouter();
  const [slug, setSlug] = useState(topics[0]?.slug ?? "");
  const [error, setError] = useState<string | null>(null);
  const { job, lost, pollError, follow } = useJob();
  const outcome = job ? jobOutcome(job) : null;
  const running = outcome === "running";

  // A finished run is a new row in GET /api/eval: re-render the server page to show it.
  useEffect(() => {
    if (outcome === "finished") router.refresh();
  }, [outcome, router]);

  async function run() {
    setError(null);
    try {
      await follow((await getSource().startEval(slug)).jobId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (topics.length === 0) {
    return <span className={styles.disabledNote}>Ingest a PEP discussion first to evaluate it</span>;
  }

  const status = error ?? pollError
    ?? (lost ? "The API no longer knows this job." : null)
    ?? (outcome === "failed" ? job?.error ?? "The evaluation stopped." : null)
    ?? (running ? `Comparing with the PEP… ${formatPercent(job?.progress ?? 0)}` : null)
    ?? (outcome === "finished" ? "Done. The scorecard below is updated." : null);

  return (
    <div className={styles.runEval}>
      <label className={styles.srOnly} htmlFor="eval-topic">PEP to evaluate</label>
      <select id="eval-topic" className={styles.select} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={running}>
        {topics.map((t) => <option key={t.slug} value={t.slug}>PEP {t.pepNumber}: {t.title}</option>)}
      </select>
      <Button variant="primary" onClick={run} disabled={running || !slug}>{running ? "Evaluating…" : "Run evaluation"}</Button>
      <span className={`${styles.disabledNote} ${error || pollError || lost || outcome === "failed" ? styles.no : ""}`} role="status">{status}</span>
    </div>
  );
}
