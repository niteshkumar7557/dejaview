import type { EvidenceView } from "@dejaview/shared";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Ref } from "../ui/Ref";
import { VerifiedMark } from "../ui/VerifiedMark";
import styles from "./decision.module.css";

export function EvidenceQuote({ evidence, topicSlug }: { evidence: EvidenceView; topicSlug: string }) {
  return (
    <figure className={`${styles.quote} ${evidence.verified ? "" : styles.quoteUnverified}`}>
      <blockquote cite={evidence.postUrl ?? undefined}>“{evidence.quote}”</blockquote>
      <figcaption className={styles.quoteMeta}>
        <span className={styles.author}>{evidence.author}</span>
        <span>{formatDate(evidence.createdAt)}</span>
        <Ref kind="post" value={String(evidence.postId)} href={evidence.postUrl ?? undefined} title="Open the original post" />
        <VerifiedMark verified={evidence.verified} score={evidence.matchScore} />
        <Link className={styles.jump} href={`/topics/${topicSlug}?tab=timeline#post-${evidence.postId}`}>Show in thread</Link>
      </figcaption>
    </figure>
  );
}
