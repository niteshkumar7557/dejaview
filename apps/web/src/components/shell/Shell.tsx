import { type ReactNode, Suspense } from "react";
import { usingMocks } from "@/lib/source";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import styles from "./shell.module.css";

/** The framed-sheet shell: one tinted L (sidebar + top bar) and the page on a white sheet. */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <a href="#main" className={styles.skip}>Skip to content</a>
      <Sidebar />
      <Suspense fallback={<header className={styles.topbar} />}>
        <TopBar sampleData={usingMocks} />
      </Suspense>
      <main id="main" className={styles.sheet}>
        {children}
      </main>
    </div>
  );
}
