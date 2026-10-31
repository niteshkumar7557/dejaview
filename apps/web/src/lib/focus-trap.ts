/**
 * Where Tab should move inside a modal with `count` focusable elements, given the focused index
 * (-1 when focus is outside). Returns null when the browser's own move stays inside the trap.
 */
export function nextFocusIndex(current: number, count: number, shift: boolean): number | null {
  if (count === 0) return null;
  if (current < 0) return shift ? count - 1 : 0;
  if (!shift && current === count - 1) return 0;
  if (shift && current === 0) return count - 1;
  return null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keydown handler that keeps Tab and Shift+Tab inside `container`. */
export function trapTab(event: KeyboardEvent | { key: string; shiftKey: boolean; preventDefault(): void }, container: HTMLElement | null): void {
  if (event.key !== "Tab" || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = nextFocusIndex(index, items.length, event.shiftKey);
  if (next !== null) {
    event.preventDefault();
    items[next]?.focus();
  }
}
