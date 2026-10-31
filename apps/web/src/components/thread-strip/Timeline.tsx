"use client";

import type { TimelinePost } from "@dejaview/shared";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatCount, formatDate, formatScore } from "@/lib/format";
import { gsap, prefersReducedMotion, registerMotion } from "@/lib/motion";
import { groupTimeline, TRIAGE_TEXT } from "@/lib/timeline";
import { Ref } from "../ui/Ref";
import { Pill } from "../ui/StatusPill";
import styles from "./timeline.module.css";

registerMotion();

/** Scrolls to #post-n and flashes it, so a jump from the strip or a quote lands visibly. */
function useJumpToHash(root: React.RefObject<HTMLOListElement | null>) {
  useEffect(() => {
    function jump() {
      const id = window.location.hash.slice(1);
      if (!id.startsWith("post-")) return;
      const el = root.current?.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
      if (!el) return;
      if (prefersReducedMotion()) {
        el.scrollIntoView({ block: "center" });
        return;
      }
      gsap.to(window, { duration: 0.5, ease: "power2.out", scrollTo: { y: el, offsetY: 96 } });
      gsap.fromTo(el, { backgroundColor: "#e3eff2" }, { backgroundColor: "rgba(227,239,242,0)", duration: 1.2, delay: 0.35, ease: "power1.out", clearProps: "backgroundColor" });
    }
    jump();
    window.addEventListener("hashchange", jump);
    return () => window.removeEventListener("hashchange", jump);
  }, [root]);
}

export function Timeline({ posts, decisionTitles }: { posts: TimelinePost[]; decisionTitles: Record<number, string> }) {
  const root = useRef<HTMLOListElement>(null);
  useJumpToHash(root);
  const items = groupTimeline(posts);

  return (
    <ol className={styles.timeline} ref={root}>
      {items.map((item) => {
        if (item.type === "filtered") {
          const first = item.posts[0]!.id;
          const last = item.posts[item.posts.length - 1]!.id;
          return (
            <li key={`f${first}`} className={styles.filtered}>
              <details>
                <summary>
                  {item.posts.length === 1 ? `Post #${first} filtered` : `${formatCount(item.posts.length)} posts filtered (#${first}–#${last})`}
                  <span className={styles.why}>thanks, +1 and quote-only replies never reach the model</span>
                  <span className={styles.show}>Show</span>
                </summary>
                <ul className={styles.filteredList}>
                  {item.posts.map((p) => (
                    <li key={p.id}><Ref kind="post" value={String(p.id)} /> {p.author}: {p.bodyClean}</li>
                  ))}
                </ul>
              </details>
            </li>
          );
        }
        const p = item.post;
        const evidence = p.decisionIds.length > 0;
        return (
          <li key={p.id} id={`post-${p.id}`} className={`${styles.post} ${evidence ? styles.evidence : ""}`}>
            <div className={styles.meta}>
              <Ref kind="post" value={String(p.id)} href={p.url ?? undefined} title="Open the original post" />
              <span className={styles.author}>{p.author}</span>
              <span className={styles.muted}>{formatDate(p.createdAt)}</span>
              {p.triageLabel && <Pill>{TRIAGE_TEXT[p.triageLabel]}</Pill>}
              {p.signalScore !== null && <span className={`${styles.muted} ${styles.score}`} title="Signal score">{formatScore(p.signalScore)}</span>}
            </div>
            <p className={styles.body}>{p.bodyClean}</p>
            {evidence && (
              <p className={styles.cites}>
                Evidence for{" "}
                {p.decisionIds.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ", "}
                    <Link href={`/decisions/${id}`}>{decisionTitles[id] ?? `decision ${id}`}</Link>
                  </span>
                ))}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
