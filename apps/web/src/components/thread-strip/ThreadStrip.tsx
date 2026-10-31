"use client";

import type { TimelinePost } from "@dejaview/shared";
import { useRef } from "react";
import { formatCount, formatDate } from "@/lib/format";
import { DUR_FAST, EASE, gsap, registerMotion, useGSAP, withMotion } from "@/lib/motion";
import { stripCounts, stripGeometry } from "@/lib/strip-geometry";
import { useHighlight } from "./HighlightContext";
import styles from "./thread-strip.module.css";

registerMotion();

const WIDTH = 1000;

/**
 * The whole discussion as one strip: a tick per post in thread order, height = signal score.
 * Pale = filtered before the model, grey = read by the model, accent = cited as evidence.
 * Hovering or focusing a decision elsewhere lights up the posts that back it.
 */
export function ThreadStrip({ posts, linkBase, height = 56, label = "Discussion" }: {
  posts: TimelinePost[];
  /** Evidence ticks link to `${linkBase}#post-{n}`. */
  linkBase: string;
  height?: number;
  label?: string;
}) {
  const { decisionId } = useHighlight();
  const root = useRef<HTMLDivElement>(null);
  const ticks = stripGeometry(posts, WIDTH, height);
  const counts = stripCounts(posts);
  const barWidth = Math.min(4, Math.max(1, (WIDTH / Math.max(1, posts.length)) * 0.55));
  const byId = new Map(posts.map((p) => [p.id, p]));

  useGSAP(
    () => {
      const all = gsap.utils.toArray<SVGRectElement>("[data-kind]:not([data-kind='skipped'])", root.current);
      const lit = decisionId === null
        ? []
        : all.filter((el) => (el.dataset.decisions ?? "").split(" ").includes(String(decisionId)));
      const dim = decisionId === null ? [] : all.filter((el) => !lit.includes(el));
      const rest = all.filter((el) => !lit.includes(el) && !dim.includes(el));
      const tween = (targets: Element[], vars: gsap.TweenVars) => { if (targets.length) gsap.to(targets, vars); };
      const set = (targets: Element[], vars: gsap.TweenVars) => { if (targets.length) gsap.set(targets, vars); };
      withMotion(
        () => {
          tween(lit, { scaleY: 1.35, scaleX: 2.5, opacity: 1, transformOrigin: "50% 100%", duration: DUR_FAST, ease: EASE, overwrite: true });
          tween(dim, { scaleY: 1, scaleX: 1, opacity: 0.3, duration: DUR_FAST, ease: EASE, overwrite: true });
          tween(rest, { scaleY: 1, scaleX: 1, opacity: 1, duration: DUR_FAST, ease: EASE, overwrite: true });
        },
        () => {
          set(lit, { scaleY: 1.35, scaleX: 2.5, opacity: 1, transformOrigin: "50% 100%" });
          set(dim, { scaleY: 1, scaleX: 1, opacity: 0.3 });
          set(rest, { scaleY: 1, scaleX: 1, opacity: 1 });
        },
      );
    },
    { scope: root, dependencies: [decisionId, posts.length], revertOnUpdate: false },
  );

  return (
    <figure className={styles.strip} ref={root} aria-label={label}>
      <figcaption className={styles.caption}>
        <span className="num">
          {formatCount(counts.total)} posts · {formatCount(counts.read)} read by the model · {formatCount(counts.evidence)} cited as evidence
        </span>
        <span className={styles.legend} aria-hidden="true">
          <span><i className={styles.swSkipped} />Filtered</span>
          <span><i className={styles.swRead} />Read</span>
          <span><i className={styles.swEvidence} />Evidence</span>
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${Math.round(height * 1.4)}`} preserveAspectRatio="none" className={styles.svg}
        style={{ height: Math.round(height * 1.4) }} role="group" aria-label={`${counts.total} posts, ${counts.evidence} cited as evidence`}>
        {/* role="group", not "img": an img hides its children, and the evidence ticks are links. */}
        <line aria-hidden="true" x1="0" x2={WIDTH} y1={height * 1.4 - 0.5} y2={height * 1.4 - 0.5} className={styles.baseline} />
        {ticks.map((t) => {
          const y = height * 1.4 - 1 - t.h;
          const rect = (
            <rect key={t.postId} x={t.x - barWidth / 2} y={y} width={barWidth} height={t.h}
              className={styles[t.kind]} data-kind={t.kind} data-decisions={t.decisionIds.join(" ")} />
          );
          if (t.kind !== "evidence") return rect;
          const p = byId.get(t.postId)!;
          return (
            <a key={t.postId} href={`${linkBase}#post-${t.postId}`} aria-label={`Post ${t.postId} by ${p.author}`}>
              <title>{`#${t.postId} · ${p.author} · ${formatDate(p.createdAt)}`}</title>
              {rect}
            </a>
          );
        })}
      </svg>
    </figure>
  );
}
