import type { ReasonView } from "@dejaview/shared";
import { EvidenceQuote } from "./EvidenceQuote";
import styles from "./decision.module.css";

export function ReasonList({ reasons, topicSlug }: { reasons: ReasonView[]; topicSlug: string }) {
  return (
    <ol className={styles.reasons}>
      {reasons.map((reason) => (
        <li key={reason.id}>
          <h3 className={styles.reasonText}>{reason.text}</h3>
          <div className={styles.quotes}>
            {reason.evidence.map((e) => <EvidenceQuote key={e.id} evidence={e} topicSlug={topicSlug} />)}
          </div>
        </li>
      ))}
    </ol>
  );
}
