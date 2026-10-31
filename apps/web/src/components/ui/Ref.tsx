import Link from "next/link";
import { type RefKind, refText } from "@/lib/refs";
import styles from "./ui.module.css";

/** A reference in the product's own mono face: post numbers, PEPs, SHAs, paths, symbols. */
export function Ref({ kind, value, href, title }: { kind: RefKind; value: string; href?: string; title?: string }) {
  const text = refText(kind, value);
  if (!href) return <span className={styles.ref} title={title}>{text}</span>;
  const external = href.startsWith("http");
  return external ? (
    <a className={styles.ref} href={href} target="_blank" rel="noreferrer" title={title}>{text}</a>
  ) : (
    <Link className={styles.ref} href={href} title={title}>{text}</Link>
  );
}
