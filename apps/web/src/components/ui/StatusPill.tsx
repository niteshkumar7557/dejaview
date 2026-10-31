import type { DecisionStatus } from "@dejaview/shared";
import styles from "./ui.module.css";

const LABEL: Record<DecisionStatus, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  open: "Open",
};

export function statusLabel(status: DecisionStatus): string {
  return LABEL[status];
}

export function StatusPill({ status }: { status: DecisionStatus }) {
  return <span className={`${styles.pill} ${styles[status]}`}>{LABEL[status]}</span>;
}

export function Pill({ children }: { children: string }) {
  return <span className={`${styles.pill} ${styles.neutral}`}>{children}</span>;
}
