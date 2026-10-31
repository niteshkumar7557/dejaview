import { describe, expect, it } from "vitest";
import { activeNav } from "./nav";

describe("activeNav", () => {
  it("marks Overview on the home page", () => expect(activeNav("/").label).toBe("Overview"));
  it("keeps topic pages under Overview", () => expect(activeNav("/topics/pep-701").label).toBe("Overview"));
  it("marks Decisions on a decision page", () => expect(activeNav("/decisions/12").label).toBe("Decisions"));
  it("marks PR checks", () => expect(activeNav("/pr-checks").label).toBe("PR checks"));
  it("falls back to Overview for unknown paths", () => expect(activeNav("/nowhere").label).toBe("Overview"));
});
