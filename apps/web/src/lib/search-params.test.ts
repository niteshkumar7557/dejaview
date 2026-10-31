import { describe, expect, it } from "vitest";
import { parseDecisionQuery } from "./search-params";

describe("parseDecisionQuery", () => {
  it("reads every filter", () => {
    expect(parseDecisionQuery({ q: " walrus ", status: "rejected", topic: "pep-701", verified: "on" })).toEqual({
      q: "walrus", status: "rejected", topic: "pep-701", verified: true,
    });
  });
  it("accepts verified=true from links", () => expect(parseDecisionQuery({ verified: "true" }).verified).toBe(true));
  it("ignores an unknown status and empty values", () => {
    expect(parseDecisionQuery({ status: "maybe", q: "", topic: "" })).toEqual({});
  });
  it("takes the first value of repeated params", () => {
    expect(parseDecisionQuery({ q: ["a", "b"] })).toEqual({ q: "a" });
  });
});
