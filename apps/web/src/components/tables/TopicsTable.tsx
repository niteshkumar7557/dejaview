import type { TopicSummary } from "@dejaview/shared";
import Link from "next/link";
import { formatCount, formatPercent, ofTotal } from "@/lib/format";
import { Ref } from "../ui/Ref";
import styles from "./tables.module.css";

export interface TopicRow {
  topic: TopicSummary;
  verified: number;
  quotes: number;
}

export function TopicsTable({ rows }: { rows: TopicRow[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Discussion</th>
          <th scope="col" className={styles.num}>Decisions</th>
          <th scope="col" className={styles.num}>Rejected</th>
          <th scope="col" className={styles.num}>Quotes verified</th>
          <th scope="col" className={styles.num}>Recall</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ topic, verified, quotes }) => (
          <tr key={topic.slug}>
            <td>
              <div className={styles.identity}>
                <Link className={styles.title} href={`/topics/${topic.slug}`}>{topic.title}</Link>
                <span className={styles.sub}>
                  {topic.pepNumber !== null && <Ref kind="pep" value={String(topic.pepNumber)} />} · {topic.sourceCount} sources
                </span>
              </div>
            </td>
            <td className={styles.num} data-label="Decisions">{formatCount(topic.decisionCount)}</td>
            <td className={styles.num} data-label="Rejected">{formatCount(topic.rejectedCount)}</td>
            <td className={styles.num} data-label="Quotes verified">
              <span className={styles.stackNum}>
                {formatPercent(quotes ? verified / quotes : null)}
                <span className={styles.sub}>{ofTotal(verified, quotes)}</span>
              </span>
            </td>
            <td className={styles.num} data-label="Recall">
              {topic.lastRecall === null ? <span className={styles.dash}>—</span> : formatPercent(topic.lastRecall)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
