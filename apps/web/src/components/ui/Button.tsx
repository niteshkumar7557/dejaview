import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "text";

export function ButtonLink({ href, variant = "secondary", children }: { href: string; variant?: Variant; children: ReactNode }) {
  return <Link href={href} className={`${styles.button} ${styles[variant]}`}>{children}</Link>;
}

export function Button({ variant = "secondary", className, ...rest }: ComponentPropsWithRef<"button"> & { variant?: Variant }) {
  return <button type="button" {...rest} className={`${styles.button} ${styles[variant]} ${className ?? ""}`} />;
}
