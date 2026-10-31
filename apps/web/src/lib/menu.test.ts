import { describe, expect, it } from "vitest";
import { menuTransition } from "./menu";

describe("menuTransition", () => {
  it("opens a hidden sheet when asked to open", () => expect(menuTransition(true, true)).toBe("open"));
  it("never closes in the same pass that opens", () => expect(menuTransition(true, false)).toBe("none"));
  it("closes a visible sheet when asked to close", () => expect(menuTransition(false, false)).toBe("close"));
  it("does nothing when closed and hidden", () => expect(menuTransition(false, true)).toBe("none"));
});
