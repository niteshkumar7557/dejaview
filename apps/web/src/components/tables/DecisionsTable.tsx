"use client";

import type { DecisionSummary } from "@dejaview/shared";
import Link from "next/link";
import { ofTotal } from "@/lib/format";
import { useHighlight } from "../thread-strip/HighlightContext";
import { Ref } from "../ui/Ref";
import { StatusPill } from "../ui/StatusPill";
import { VerifiedMark } from "../ui/VerifiedMark";
import styles from "./tables.module.css";

/** Decisions as rows. Hover or focus on a row lights up its evidence in a ThreadStrip on the same page. */
export function DecisionsTable({ decisions, showTopic = false, caption }: {
  decisions: DecisionSummary[];
  showTopic?: boolean;
  caption?: string;
}) {
  const { setDecisionId } = useHighlight();
  return (
    <table className={styles.table}>
      {caption && <caption className="visually-hidden">{caption}</caption>}
      <thead>
        <tr>
          <th scope="col" className={styles.statusCell}>Status</th>
          <th scope="col">Decision</th>
          {showTopic && <th scope="col">Discussion</th>}
          <th scope="col" className={styles.num}>Quotes verified</th>
          <th scope="col">Linked code</th>
        </tr>
      </thead>
      <tbody>
        {decisions.map((d) => {
          const anchor = d.anchors[0];
          const allVerified = d.verifiedEvidence === d.totalEvidence;
          return (
            <tr
              key={d.id}
              onMouseEnter={() => setDecisionId(d.id)}
              onMouseLeave={() => setDecisionId(null)}
              onFocus={() => setDecisionId(d.id)}
              onBlur={() => setDecisionId(null)}
            >
              <td className={styles.statusCell}><StatusPill status={d.status} /></td>
              <td>
                <div className={styles.identity}>
                  <Link className={styles.title} href={`/decisions/${d.id}`}>{d.title}</Link>
                  {d.reasons[0] && <span className={styles.sub}>{d.reasons[0]}</span>}
                </div>
              </td>
              {showTopic && (
                <td data-label="Discussion">
                  {d.topic.pepNumber !== null
                    ? <Ref kind="pep" value={String(d.topic.pepNumber)} href={`/topics/${d.topic.slug}`} />
                    : <Link href={`/topics/${d.topic.slug}`}>{d.topic.title}</Link>}
                </td>
              )}
              <td className={styles.num} data-label="Quotes verified">
                <span className={styles.stackNum}>
                  {ofTotal(d.verifiedEvidence, d.totalEvidence)}
                  {!allVerified && <VerifiedMark verified={false} score={0} showScore={false} />}
                </span>
              </td>
              <td data-label="Linked code">
                {anchor
                  ? <Ref kind="path" value={anchor.currentPath ?? anchor.originalPath} title={anchor.symbol ?? undefined} />
                  : <span className={styles.dash}>—</span>} {/* taste-skill-ignore: missing-value mark */}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
