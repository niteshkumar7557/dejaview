import type { PrCheckView } from "@dejaview/shared";
import Link from "next/link";
import { prCheckResult } from "@/lib/pr-checks";
import { Ref } from "../ui/Ref";
import styles from "./tables.module.css";

export function PrCheckRows({ checks }: { checks: PrCheckView[] }) {
  return (
    <ul className={styles.list}>
      {checks.map((check) => (
        <li key={check.id} className={styles.listRow}>
          <Ref kind="post" value={String(check.request.prNumber)} />
          <Link href={`/pr-checks?pr=${check.id}`} className={`${styles.title} ${styles.listTitle}`}>{check.request.title}</Link>
          <span className={styles.listMeta}>{prCheckResult(check)}</span>
        </li>
      ))}
    </ul>
  );
}
