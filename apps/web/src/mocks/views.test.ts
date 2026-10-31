import { describe, expect, it } from "vitest";
import { decisions, topics } from "./dataset";
import { buildThread } from "./threads";
import { timeline, toDecisionCard, toDecisionSummary, toTopicDetail, toTopicSummary } from "./views";

describe("topic summaries add up from the rows", () => {
  for (const topic of topics) {
    it(`${topic.slug}: counts come from its decisions`, () => {
      const own = decisions.filter((d) => d.topicSlug === topic.slug);
      const summary = toTopicSummary(topic.slug);
      expect(summary.decisionCount).toBe(own.length);
      expect(summary.rejectedCount).toBe(own.filter((d) => d.status === "rejected").length);
      expect(summary.sourceCount).toBe(topic.sources.length);
    });
  }
});

describe("evidence points at real posts", () => {
  for (const decision of decisions) {
    it(`decision ${decision.id}: every quote's post exists and cites the decision`, () => {
      const posts = timeline(decision.topicSlug);
      expect(posts).not.toBeNull();
      for (const reason of decision.reasons) {
        for (const quote of reason.quotes) {
          const post = posts!.find((p) => p.id === quote.post);
          expect(post, `post #${quote.post}`).toBeDefined();
          expect(post!.decisionIds).toContain(decision.id);
          expect(post!.skipped).toBe(false);
          // A verified quote appears verbatim in its post; an unverified one does not.
          expect(post!.bodyClean.includes(quote.quote)).toBe(quote.verified !== false);
        }
      }
    });
  }
});

describe("threads", () => {
  it("have the topic's post count", () => {
    expect(timeline("pep-701")!.length).toBe(212);
    expect(timeline("pep-698")!.length).toBe(64);
    expect(timeline("pep-695")!.length).toBe(318);
  });
  it("are deterministic", () => {
    const topic = topics[0]!;
    expect(buildThread(topic)).toEqual(buildThread(topic));
  });
  it("number posts from 1 in order", () => {
    const posts = timeline("pep-698")!;
    expect(posts.map((p) => p.id)).toEqual(posts.map((_, i) => i + 1));
  });
  it("return null for an unknown topic", () => expect(timeline("pep-9999")).toBeNull());
});

describe("decision views", () => {
  it("never claim more verified quotes than quotes", () => {
    for (const d of decisions) {
      const s = toDecisionSummary(d);
      expect(s.verifiedEvidence).toBeLessThanOrEqual(s.totalEvidence);
      expect(s.totalEvidence).toBeGreaterThan(0);
    }
  });
  it("return null for an unknown id", () => expect(toDecisionCard(999)).toBeNull());
  it("include exactly one decision whose quotes are all unverified, at low confidence", () => {
    const cards = decisions.map((d) => toDecisionCard(d.id)!);
    const unverified = cards.filter((c) => c.reasons.every((r) => r.evidence.every((e) => !e.verified)));
    expect(unverified).toHaveLength(1);
    expect(unverified[0]!.confidence).toBe("low");
  });
  it("include an anchor lost at HEAD and one relocated by a rename", () => {
    const anchors = decisions.flatMap((d) => d.anchors);
    expect(anchors.some((a) => a.currentPath === null)).toBe(true);
    expect(anchors.some((a) => a.relocatedBy === "git-follow" && a.currentPath !== a.originalPath)).toBe(true);
  });
  it("list the evidence authors as people", () => {
    const card = toDecisionCard(decisions[0]!.id)!;
    const authors = new Set(card.reasons.flatMap((r) => r.evidence.map((e) => e.author)));
    expect(new Set(card.people)).toEqual(authors);
  });
  it("cover every status", () => {
    const statuses = new Set(decisions.map((d) => d.status));
    expect(statuses).toEqual(new Set(["accepted", "rejected", "withdrawn", "open"]));
    expect(decisions.filter((d) => d.status === "rejected").length).toBeGreaterThanOrEqual(12);
    expect(decisions).toHaveLength(20);
  });
  it("give topic detail its own decisions only", () => {
    const detail = toTopicDetail("pep-698")!;
    expect(detail.decisions.every((d) => d.topic.slug === "pep-698")).toBe(true);
    expect(toTopicDetail("pep-9999")).toBeNull();
  });
});
