"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { Mark } from "./Mark";
import { activeNav, NAV } from "./nav";
import styles from "./shell.module.css";

export function Brand() {
  return (
    <Link href="/" className={styles.brand}>
      <Mark />
      <span className={styles.brandText}>
        <span className={styles.wordmark}>DejaView</span>
        <span className={styles.scope}>python/cpython</span>
      </span>
    </Link>
  );
}

export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = activeNav(pathname);
  return (
    <nav aria-label="Main">
      <ul className={styles.nav}>
        {NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.navItem}
              aria-current={item.href === active.href ? "page" : undefined}
              onClick={onNavigate}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <Brand />
      <NavList />
      <p className={styles.sidebarFoot}>
        Sources: discuss.python.org, GitHub
        <br />
        Models: qwen3.5:4b, qwen3.5:9b
      </p>
    </aside>
  );
}
