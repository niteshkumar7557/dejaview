"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { activeNav } from "./nav";
import { PhoneMenu } from "./PhoneMenu";
import styles from "./shell.module.css";

export function TopBar({ sampleData }: { sampleData: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const input = useRef<HTMLInputElement>(null);

  // "/" focuses search unless the user is already typing somewhere.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get("q")?.toString().trim() ?? "";
    router.push(q ? `/decisions?q=${encodeURIComponent(q)}` : "/decisions");
  }

  return (
    <header className={styles.topbar}>
      <PhoneMenu title={activeNav(pathname).label} />
      <form role="search" className={styles.search} action="/decisions" onSubmit={submit}>
        <Icon name="search" size={14} />
        <label htmlFor="global-search" className="visually-hidden">Search decisions</label>
        <input
          ref={input}
          id="global-search"
          name="q"
          type="search"
          placeholder="Search decisions"
          defaultValue={pathname === "/decisions" ? (params.get("q") ?? "") : ""}
          key={pathname === "/decisions" ? params.get("q") : "other"}
        />
        <kbd className={styles.kbd} aria-hidden="true">/</kbd>
      </form>
      <div className={styles.topbarEnd}>
        {sampleData && <span className={styles.samplePill} title="NEXT_PUBLIC_USE_MOCKS is on">Sample data</span>}
      </div>
    </header>
  );
}
