// GSAP setup shared by client components. Import only from "use client" files: GSAP never runs on the server.
// App screens use motion as feedback only (no decorative entrances); every effect has a reduced-motion branch.

import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

let registered = false;

export function registerMotion(): void {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(useGSAP, ScrollToPlugin);
  registered = true;
}

export const DUR_FAST = 0.18;
export const DUR = 0.28;
export const EASE = "power2.out";

export const REDUCED = "(prefers-reduced-motion: reduce)";

/**
 * Runs `full`, or `reduced` when the user prefers reduced motion, once, at call time.
 * These are one-shot feedback animations, so a preference change mid-session applies to the next one;
 * (gsap.matchMedia would keep listeners alive and replay stale animations when the preference flips).
 */
export function withMotion(full: () => void, reduced: () => void): void {
  if (prefersReducedMotion()) reduced();
  else full();
}

/** True when the user prefers reduced motion (checked at call time). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

export { gsap, useGSAP };
