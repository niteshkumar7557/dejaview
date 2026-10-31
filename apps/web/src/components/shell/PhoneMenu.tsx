"use client";

import { useRef, useState } from "react";
import { DUR, EASE, gsap, registerMotion, useGSAP, withMotion } from "@/lib/motion";
import { Icon } from "./Icon";
import { Brand, NavList } from "./Sidebar";
import styles from "./shell.module.css";

registerMotion();

/** Below 1100px the sidebar folds into this: a menu button and a full-screen sheet. */
export function PhoneMenu({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      const el = sheet.current;
      if (!el) return;
      if (open) {
        el.hidden = false;
        closeButton.current?.focus();
        withMotion(
          () => { gsap.fromTo(el, { xPercent: -100 }, { xPercent: 0, duration: DUR, ease: EASE }); },
          () => { gsap.set(el, { xPercent: 0 }); },
        );
      }
      if (!el.hidden) {
        withMotion(
          () => { gsap.to(el, { xPercent: -100, duration: DUR, ease: EASE, onComplete: () => { el.hidden = true; } }); },
          () => { el.hidden = true; },
        );
      }
    },
    { dependencies: [open] },
  );

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  return (
    <div className={styles.phoneOnly}>
      <button
        ref={button}
        type="button"
        className={styles.iconButton}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="phone-menu"
        onClick={() => setOpen(true)}
      >
        <Icon name="menu" />
      </button>
      <span className={styles.phoneTitle}>{title}</span>
      <div
        ref={sheet}
        id="phone-menu"
        className={styles.phoneSheet}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden
        onKeyDown={(event) => event.key === "Escape" && close()}
      >
        <div className={styles.phoneSheetHead}>
          <Brand />
          <button ref={closeButton} type="button" className={styles.iconButton} aria-label="Close menu" onClick={close}>
            <Icon name="close" />
          </button>
        </div>
        <NavList onNavigate={close} />
      </div>
    </div>
  );
}
