import type { EvalRunView } from "@dejaview/shared";
import { formatPercent, ofTotal } from "@/lib/format";
import { matchedCount } from "@/lib/eval";
import styles from "./eval.module.css";

/** One row per PEP: the share of its Rejected Ideas recovered from the discussion alone. */
export function RecallBars({ runs }: { runs: EvalRunView[] }) {
  return (
    <ul className={styles.bars}>
      {runs.map((run) => (
        <li key={run.id} className={styles.barRow}>
          <a href={`#pep-${run.pepNumber}`}>PEP {run.pepNumber}</a>
          <span className={styles.track} role="img" aria-label={`Recall ${formatPercent(run.recall)}`}>
            <span className={styles.fill} style={{ width: `${run.recall * 100}%` }} />
          </span>
          <span className={styles.value}>{ofTotal(matchedCount(run), run.groundTruth.length)} · {formatPercent(run.recall)}</span>
          <span className={styles.agree}>reasons agree {formatPercent(run.reasonAgreement)}</span>
        </li>
      ))}
    </ul>
  );
}
