import { describe, expect, it } from "vitest";
import { decisionPath, decisionsPath, jobPath, llmCallsPath, timelinePath, topicPath } from "./api-paths";

describe("decisionsPath", () => {
  it("encodes every filter that is set", () => {
    expect(decisionsPath({ q: "as name", status: "rejected", verified: true })).toBe(
      "/api/decisions?q=as+name&status=rejected&verified=true",
    );
  });
  it("has no query string without filters", () => expect(decisionsPath({})).toBe("/api/decisions"));
  it("drops an empty search", () => expect(decisionsPath({ q: "" })).toBe("/api/decisions"));
});

describe("resource paths", () => {
  it("encodes the topic slug", () => expect(topicPath("pep 701")).toBe("/api/topics/pep%20701"));
  it("builds the timeline path", () => expect(timelinePath("pep-701")).toBe("/api/topics/pep-701/timeline"));
  it("builds decision paths", () => {
    expect(decisionPath(12)).toBe("/api/decisions/12");
    expect(llmCallsPath(12)).toBe("/api/decisions/12/llm-calls");
  });
  it("builds the job path", () => expect(jobPath(3)).toBe("/api/jobs/3"));
});
