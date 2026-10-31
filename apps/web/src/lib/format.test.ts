import { describe, expect, it } from "vitest";
import { formatCount, formatDate, formatPercent, formatScore, ofTotal, shortSha } from "./format";

describe("formatPercent", () => {
  it("rounds a ratio to whole percent by default", () => expect(formatPercent(0.8182)).toBe("82%"));
  it("keeps the requested decimals", () => expect(formatPercent(0.8182, 1)).toBe("81.8%"));
  it("prints a real zero", () => expect(formatPercent(0)).toBe("0%"));
  it("prints a dash for a missing value", () => expect(formatPercent(null)).toBe("—"));
});

describe("formatCount", () => {
  it("adds thousands separators", () => expect(formatCount(1204)).toBe("1,204"));
  it("prints zero", () => expect(formatCount(0)).toBe("0"));
});

describe("formatDate", () => {
  it("prints the ISO date", () => expect(formatDate("2023-02-14T09:12:00Z")).toBe("2023-02-14"));
  it("prints a dash for null", () => expect(formatDate(null)).toBe("—"));
});

describe("formatScore", () => {
  it("prints two decimals", () => {
    expect(formatScore(1)).toBe("1.00");
    expect(formatScore(0.615)).toBe("0.62");
  });
});

describe("ofTotal", () => {
  it("says part of total", () => expect(ofTotal(9, 11)).toBe("9 of 11"));
});

describe("shortSha", () => {
  it("keeps seven characters", () => expect(shortSha("a3f09c1e2b7d")).toBe("a3f09c1"));
  it("prints a dash for null", () => expect(shortSha(null)).toBe("—"));
});
