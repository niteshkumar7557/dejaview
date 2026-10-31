import type { ReactNode } from "react";
import styles from "./ui.module.css";

export function Card({ title, meta, children, id, flush = false }: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  id?: string;
  flush?: boolean;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={styles.card} id={id} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle} id={headingId}>{title}</h2>
        {meta && <div className={styles.cardMeta}>{meta}</div>}
      </div>
      <div className={flush ? undefined : styles.cardBody}>{children}</div>
    </section>
  );
}
