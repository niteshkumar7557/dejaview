"use client";

import type { LlmCallView } from "@dejaview/shared";
import { useRef, useState } from "react";
import { formatCount } from "@/lib/format";
import { DUR, EASE, gsap, registerMotion, useGSAP, withMotion } from "@/lib/motion";
import { Icon } from "../shell/Icon";
import { Button } from "../ui/Button";
import styles from "./decision.module.css";

registerMotion();

/** Every model call behind this decision: what the model was shown and what it answered. */
export function AuditDrawer({ calls }: { calls: LlmCallView[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useGSAP(
    () => {
      if (!mounted || !panel.current) return;
      const backdrop = root.current?.querySelector(`.${styles.backdrop}`);
      if (open) {
        closeButton.current?.focus();
        return withMotion(
          () => {
            gsap.fromTo(panel.current, { xPercent: 100 }, { xPercent: 0, duration: DUR, ease: EASE });
            gsap.fromTo(backdrop ?? [], { opacity: 0 }, { opacity: 0.32, duration: DUR, ease: EASE });
          },
          () => { gsap.set(backdrop ?? [], { opacity: 0.32 }); },
        );
      }
      return withMotion(
        () => {
          gsap.to(panel.current, { xPercent: 100, duration: DUR, ease: "power2.in", onComplete: () => setMounted(false) });
          gsap.to(backdrop ?? [], { opacity: 0, duration: DUR });
        },
        () => setMounted(false),
      );
    },
    { scope: root, dependencies: [open, mounted], revertOnUpdate: false },
  );

  function show() {
    setMounted(true);
    setOpen(true);
  }
  function hide() {
    setOpen(false);
    trigger.current?.focus();
  }

  const total = calls.reduce((sum, c) => sum + (c.durationMs ?? 0), 0);

  return (
    <div ref={root}>
      <Button ref={trigger} variant="secondary" onClick={show} aria-haspopup="dialog">
        {calls.length === 1 ? "1 model call" : `${calls.length} model calls`}
      </Button>
      <p className={styles.anchorNote} style={{ marginTop: 8 }}>
        {formatCount(Math.round(total / 1000))} s of model time on the laptop GPU.
      </p>
      {mounted && (
        <>
          <div className={styles.backdrop} onClick={hide} aria-hidden="true" />
          <div ref={panel} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="audit-title"
            onKeyDown={(e) => e.key === "Escape" && hide()}>
            <div className={styles.drawerHead}>
              <h2 id="audit-title" className={styles.drawerTitle}>Model calls behind this decision</h2>
              <button ref={closeButton} type="button" onClick={hide} aria-label="Close" style={{ border: 0, background: "transparent", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="close" />
              </button>
            </div>
            <ol className={styles.drawerBody}>
              {calls.map((c) => (
                <li key={c.id} className={styles.call}>
                  <div className={styles.callHead}>
                    <span className={styles.callStage}>{c.stage[0]!.toUpperCase() + c.stage.slice(1)}</span>
                    <span className="mono">{c.model}</span>
                    {/* taste-skill-ignore: dash marks a missing duration */}
                    <span className="num">{c.durationMs === null ? "—" : `${(c.durationMs / 1000).toFixed(1)} s`}</span>
                  </div>
                  <span className={styles.preLabel}>Prompt</span>
                  <pre className={styles.pre}>{c.prompt}</pre>
                  <span className={styles.preLabel}>Response</span>
                  <pre className={styles.pre}>{JSON.stringify(c.response, null, 2)}</pre>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
