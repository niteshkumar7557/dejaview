"use client";

import type { JobView } from "@dejaview/shared";
import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { formatPercent } from "@/lib/format";
import { stageRows, suggestSlug, validateIngestUrl } from "@/lib/ingest";
import { DUR, EASE, gsap, registerMotion, useGSAP, withMotion } from "@/lib/motion";
import { getSource } from "@/lib/source";
import { Button } from "../ui/Button";
import styles from "./ingest.module.css";

registerMotion();

const POLL_MS = 1000;

export function IngestPanel() {
  const [url, setUrl] = useState("");
  const [slug, setSlug] = useState("");
  const [pep, setPep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [topicSlug, setTopicSlug] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const running = job !== null && job.status !== "done" && job.status !== "failed";

  useEffect(() => {
    if (!job || !running) return;
    const timer = setInterval(async () => {
      try {
        const next = await getSource().getJob(job.id);
        if (next) setJob(next);
        setPollError(null);
      } catch {
        setPollError("Couldn't reach the server. Retrying every second.");
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [job, running]);

  useGSAP(
    () => {
      const progress = job?.progress ?? 0;
      if (!bar.current) return;
      withMotion(
        () => { gsap.to(bar.current, { scaleX: progress, duration: DUR * 2, ease: EASE, transformOrigin: "0 50%" }); },
        () => { gsap.set(bar.current, { scaleX: progress, transformOrigin: "0 50%" }); },
      );
    },
    { scope: root, dependencies: [job?.progress], revertOnUpdate: false },
  );

  function onUrl(value: string) {
    setUrl(value);
    setError(null);
    const guess = suggestSlug(value);
    if (guess) {
      setSlug(guess.slug);
      setPep(guess.pep === null ? "" : String(guess.pep));
    }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateIngestUrl(url);
    if (problem) return setError(problem);
    if (!slug.trim()) return setError("Give the discussion a short name, for example pep-701.");
    const response = await getSource().startIngest({
      url: url.trim(),
      topicSlug: slug.trim(),
      ...(pep ? { pepNumber: Number(pep) } : {}),
    });
    setTopicSlug(response.topicSlug);
    setJob(await getSource().getJob(response.jobId));
  }

  const rows = stageRows(job);

  return (
    <div className={styles.layout} ref={root}>
      <form className={styles.form} onSubmit={start} noValidate>
        <h2 className={styles.title}>Discussion to process</h2>
        <div className={styles.field}>
          <label htmlFor="ingest-url">Link</label>
          <input id="ingest-url" type="url" value={url} onChange={(e) => onUrl(e.target.value)}
            placeholder="https://discuss.python.org/t/…" aria-describedby="ingest-url-help ingest-error" disabled={running} required />
          <p id="ingest-url-help" className={styles.help}>A discuss.python.org thread, or a github.com issue or pull request.</p>
        </div>
        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor="ingest-slug">Short name</label>
            <input id="ingest-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="pep-701" disabled={running} />
          </div>
          <div className={styles.field}>
            <label htmlFor="ingest-pep">PEP number (optional)</label>
            <input id="ingest-pep" inputMode="numeric" value={pep} onChange={(e) => setPep(e.target.value.replace(/\D/g, ""))} placeholder="701" disabled={running} />
          </div>
        </div>
        <p id="ingest-error" className={styles.error} role="alert">{error}</p>
        <div className={styles.actions}>
          <Button type="submit" variant="primary" disabled={running}>{running ? "Processing…" : "Start"}</Button>
          <span className={styles.help}>The model never sees the PEP itself, only the discussion.</span>
        </div>
      </form>

      <section className={styles.progress} aria-labelledby="progress-title" aria-live="polite">
        <div className={styles.progressHead}>
          <h2 id="progress-title" className={styles.title}>
            {job === null ? "What happens next" : job.status === "done" ? "Done" : job.status === "failed" ? "Stopped" : "Processing"}
          </h2>
          <span className={`${styles.percent} num`}>{job ? formatPercent(job.progress) : "—"}</span>
        </div>
        <div className={styles.track} aria-hidden="true"><div className={styles.fill} ref={bar} /></div>
        <ol className={styles.stages}>
          {rows.map((r) => (
            <li key={r.name} className={styles[r.state]}>
              <span className={styles.dot} aria-hidden="true" />
              <span>{r.label}</span>
              <span className={styles.state}>
                {r.state === "done" ? "Done" : r.state === "running" ? "Running" : r.state === "failed" ? "Failed" : ""}
              </span>
            </li>
          ))}
        </ol>
        {pollError && <p className={styles.error}>{pollError}</p>}
        {job?.status === "failed" && <p className={styles.error}>{job.error ?? "The job stopped."} <button type="button" onClick={() => setJob(null)}>Retry</button></p>}
        {job?.status === "done" && topicSlug && (
          <p className={styles.doneLine}>
            <Link href={`/topics/${topicSlug}`}>View the decisions in {topicSlug}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
