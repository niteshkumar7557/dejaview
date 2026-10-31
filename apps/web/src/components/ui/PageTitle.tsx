import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./ui.module.css";

export interface Crumb {
  href: string;
  label: string;
}

export function PageTitle({ title, badge, subline, crumbs, actions }: {
  title: string;
  badge?: ReactNode;
  subline?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <div className={styles.titleRow}>
      <div className={styles.titleMain}>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className={styles.crumbs}>
            {crumbs.map((crumb, i) => (
              <span key={crumb.href}>
                <Link href={crumb.href}>{crumb.label}</Link>
                {i < crumbs.length - 1 && <span className={styles.crumbSep} aria-hidden="true"> / </span>}
              </span>
            ))}
          </nav>
        )}
        <div className={styles.h1Row}>
          <h1 className={styles.h1}>{title}</h1>
          {badge}
        </div>
        {subline && <p className={styles.subline}>{subline}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
