import Link from "next/link";
import styles from "./ui.module.css";

export function Tabs({ items, label }: { items: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} className={styles.tab} aria-current={item.active ? "page" : undefined} scroll={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
