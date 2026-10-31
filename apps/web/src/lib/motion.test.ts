import { afterEach, describe, expect, it, vi } from "vitest";
import { withMotion } from "./motion";

afterEach(() => vi.unstubAllGlobals());

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: reduce && q.includes("reduce") }) });
}

describe("withMotion", () => {
  it("runs only the full animation once when motion is allowed", () => {
    stubReducedMotion(false);
    const full = vi.fn();
    const reduced = vi.fn();
    withMotion(full, reduced);
    expect(full).toHaveBeenCalledTimes(1);
    expect(reduced).not.toHaveBeenCalled();
  });

  it("runs only the reduced branch once when the user prefers reduced motion", () => {
    stubReducedMotion(true);
    const full = vi.fn();
    const reduced = vi.fn();
    withMotion(full, reduced);
    expect(reduced).toHaveBeenCalledTimes(1);
    expect(full).not.toHaveBeenCalled();
  });

  it("returns nothing to clean up, so no listener outlives the call", () => {
    stubReducedMotion(false);
    expect(withMotion(() => {}, () => {})).toBeUndefined();
  });
});
