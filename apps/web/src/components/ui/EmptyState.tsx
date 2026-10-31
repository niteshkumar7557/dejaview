import styles from "./ui.module.css";

export function EmptyState({ sentence }: { sentence: string }) {
  return <p className={styles.empty}>{sentence}</p>;
}
