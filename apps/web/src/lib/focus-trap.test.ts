import { describe, expect, it } from "vitest";
import { nextFocusIndex } from "./focus-trap";

describe("nextFocusIndex", () => {
  it("wraps from the last element to the first on Tab", () => expect(nextFocusIndex(2, 3, false)).toBe(0));
  it("wraps from the first element to the last on Shift+Tab", () => expect(nextFocusIndex(0, 3, true)).toBe(2));
  it("lets the browser move focus inside the trap", () => {
    expect(nextFocusIndex(0, 3, false)).toBeNull();
    expect(nextFocusIndex(2, 3, true)).toBeNull();
  });
  it("pulls focus back in when it is outside the trap", () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
  });
});
