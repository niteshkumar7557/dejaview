"use client";

import type { DecisionSummary, TimelinePost } from "@dejaview/shared";
import Link from "next/link";
import { formatCount } from "@/lib/format";
import { labelCounts } from "@/lib/timeline";
import { StatusPill } from "../ui/StatusPill";
import { useHighlight } from "./HighlightContext";
import styles from "./rail.module.css";

/** Beside the timeline: what the model saw, and the decisions this thread produced. */
export function ThreadRail({ posts, decisions }: { posts: TimelinePost[]; decisions: DecisionSummary[] }) {
  const { setDecisionId } = useHighlight();
  const rows = labelCounts(posts);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <aside className={styles.rail}>
      <section aria-labelledby="rail-labels">
        <h2 id="rail-labels" className={styles.heading}>What the model saw</h2>
        <ul className={styles.bars}>
          {rows.map((r) => (
            <li key={r.label}>
              <span className={styles.barLabel}>{r.label}</span>
              <span className={`${styles.barValue} num`}>{formatCount(r.count)}</span>
              <span className={styles.track} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="rail-decisions">
        <h2 id="rail-decisions" className={styles.heading}>Decisions in this thread</h2>
        <ul className={styles.decisions}>
          {decisions.map((d) => (
            <li key={d.id} onMouseEnter={() => setDecisionId(d.id)} onMouseLeave={() => setDecisionId(null)}>
              <StatusPill status={d.status} />
              <Link href={`/decisions/${d.id}`} onFocus={() => setDecisionId(d.id)} onBlur={() => setDecisionId(null)}>{d.title}</Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
