"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { formatPercent } from "@/lib/format";
import {
  followedJobFromQuery, followedJobQuery, jobOutcome, overallProgress, stageRows, suggestSlug, UPLOAD_ACCEPT,
  validateIngestUrl, validateUpload,
} from "@/lib/ingest";
import { DUR, EASE, gsap, registerMotion, useGSAP, withMotion } from "@/lib/motion";
import { getSource } from "@/lib/source";
import { useJob } from "@/lib/use-job";
import { Button } from "../ui/Button";
import styles from "./ingest.module.css";

registerMotion();

type Mode = "link" | "file";

const HEADINGS = {
  idle: "What happens next",
  running: "Processing",
  failed: "Stopped",
  finished: "Done",
  "handed-off": "Thread stored",
} as const;

export function IngestPanel() {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [slug, setSlug] = useState("");
  const [pep, setPep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [topicSlug, setTopicSlug] = useState<string | null>(null);
  const { job, lost, pollError, follow, reset } = useJob();
  const bar = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const outcome = job ? jobOutcome(job) : "idle";
  const running = outcome === "running";
  // The worker runs one job at a time, so a new job can wait behind another one for a while.
  const waiting = job?.status === "queued";

  // Pick up the job named in the URL (after a refresh, or from a shared link).
  useEffect(() => {
    const followed = followedJobFromQuery(window.location.search);
    if (!followed) return;
    setTopicSlug(followed.topicSlug);
    follow(followed.jobId).catch((e: unknown) => setError(errorMessage(e)));
  }, [follow]);

  function startOver() {
    reset();
    window.history.replaceState(null, "", window.location.pathname);
  }

  useGSAP(
    () => {
      const progress = job ? overallProgress(job) : 0;
      if (!bar.current) return;
      withMotion(
        () => { gsap.to(bar.current, { scaleX: progress, duration: DUR * 2, ease: EASE, transformOrigin: "0 50%" }); },
        () => { gsap.set(bar.current, { scaleX: progress, transformOrigin: "0 50%" }); },
      );
    },
    { scope: root, dependencies: [job ? overallProgress(job) : 0], revertOnUpdate: false },
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

  function onFile(picked: File | null) {
    setFile(picked);
    setError(null);
    const guess = picked ? suggestSlug(picked.name) : null;
    if (guess) {
      setSlug(guess.slug);
      setPep(guess.pep === null ? "" : String(guess.pep));
    }
  }

  /** Sends the form the way the chosen mode needs: JSON for a link, multipart for a file. */
  function send() {
    const topic = slug.trim();
    if (mode === "link") {
      return getSource().startIngest({ url: url.trim(), topicSlug: topic, ...(pep ? { pepNumber: Number(pep) } : {}) });
    }
    const form = new FormData();
    form.set("file", file as File);
    form.set("topicSlug", topic);
    if (pep) form.set("pepNumber", pep);
    return getSource().startIngestUpload(form);
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = mode === "link" ? validateIngestUrl(url) : validateUpload(file);
    if (problem) return setError(problem);
    if (!slug.trim()) return setError("Give the discussion a short name, for example pep-701.");
    try {
      const response = await send();
      setTopicSlug(response.topicSlug);
      window.history.replaceState(null, "", followedJobQuery(response.jobId, response.topicSlug));
      await follow(response.jobId);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const rows = stageRows(job);

  return (
    <div className={styles.layout} ref={root}>
      <form className={styles.form} onSubmit={start} noValidate>
        <h2 className={styles.title}>Discussion to process</h2>
        <fieldset className={styles.modes} disabled={running}>
          <legend className={styles.srOnly}>Where the discussion comes from</legend>
          {(["link", "file"] as const).map((m) => (
            <label key={m} className={styles.mode}>
              <input type="radio" name="ingest-mode" value={m} checked={mode === m} onChange={() => { setMode(m); setError(null); }} />
              {m === "link" ? "From a link" : "From a file"}
            </label>
          ))}
        </fieldset>
        {mode === "link" ? (
          <div className={styles.field}>
            <label htmlFor="ingest-url">Link</label>
            <input id="ingest-url" type="url" value={url} onChange={(e) => onUrl(e.target.value)}
              placeholder="https://discuss.python.org/t/…" aria-describedby="ingest-url-help ingest-error" disabled={running} required />
            <p id="ingest-url-help" className={styles.help}>A discuss.python.org thread, or a github.com issue or pull request.</p>
          </div>
        ) : (
          <div className={styles.field}>
            <label htmlFor="ingest-file">File</label>
            <input id="ingest-file" type="file" accept={UPLOAD_ACCEPT} onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              aria-describedby="ingest-file-help ingest-error" disabled={running} required />
            <p id="ingest-file-help" className={styles.help}>
              A saved discussion: a JSON array of posts, or Markdown or plain text with posts separated by a line of <code>---</code>. Up to 5 MB.
            </p>
          </div>
        )}
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

      <section className={styles.progress} aria-labelledby="progress-title">
        <div className={styles.progressHead}>
          <h2 id="progress-title" className={styles.title} aria-live="polite">{waiting ? "Waiting for the worker" : HEADINGS[outcome]}</h2>
          <span className={`${styles.percent} num`}>{job ? formatPercent(overallProgress(job)) : "—"}</span>
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
        {waiting && (
          <p className={styles.help}>
            Job #{job?.id} is in the queue. The worker runs one job at a time and is finishing another one; this
            starts on its own. You can leave or refresh this page: the link in the address bar brings you back.
          </p>
        )}
        {pollError && <p className={styles.error}>{pollError}</p>}
        {lost && <p className={styles.error}>The API no longer knows this job, so progress stopped. <button type="button" onClick={startOver}>Start again</button></p>}
        {outcome === "failed" && <p className={styles.error}>{job?.error ?? "The job stopped."} <button type="button" onClick={startOver}>Retry</button></p>}
        {outcome === "handed-off" && topicSlug && (
          <p className={styles.help}>
            The worker now extracts the decisions as a separate job. On the laptop GPU that takes several minutes;{" "}
            <Link href={`/topics/${topicSlug}`}>{topicSlug}</Link> fills in when it finishes.
          </p>
        )}
        {outcome === "finished" && topicSlug && (
          <p className={styles.doneLine}>
            <Link href={`/topics/${topicSlug}`}>View the decisions in {topicSlug}</Link>
          </p>
        )}
      </section>
    </div>
  );
}
