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
export const FULL = "(prefers-reduced-motion: no-preference)";

/** Runs `full` normally and `reduced` when the user prefers reduced motion. Returns a revert function. */
export function withMotion(full: () => void, reduced: () => void): () => void {
  const mm = gsap.matchMedia();
  mm.add(FULL, full);
  mm.add(REDUCED, reduced);
  return () => mm.revert();
}

/** True when the user prefers reduced motion (checked at call time). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia(REDUCED).matches;
}

export { gsap, useGSAP };
