import { formatScore } from "@/lib/format";
import styles from "./ui.module.css";

/** Whether a quote was found in its post, with the match score. Words and a glyph, never colour alone. */
export function VerifiedMark({ verified, score, showScore = true }: { verified: boolean; score: number; showScore?: boolean }) {
  return (
    <span className={`${styles.verified} ${verified ? styles.verifiedOk : styles.verifiedNo}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {verified ? <path d="M2.5 6.2l2.3 2.3L9.5 3.5" /> : <path d="M6 1.8L10.8 10H1.2zM6 5v2.2M6 8.6v.1" />}
      </svg>
      {verified ? "Verified" : "Unverified"}
      {showScore && <span className={styles.score}>{formatScore(score)}</span>}
    </span>
  );
}
