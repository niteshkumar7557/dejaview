import type { DecisionSummary, TopicSummary } from "@dejaview/shared";
import { formatCount, formatPercent } from "./format";
import type { Kpi } from "./kpi";

/** The one fact on the overview that most needs a maintainer's attention. */
export function overviewFinding(decisions: DecisionSummary[]): string {
  const shaky = new Map<string, { pep: number | null; title: string; count: number }>();
  for (const d of decisions) {
    if (d.verifiedEvidence === d.totalEvidence) continue;
    const entry = shaky.get(d.topic.slug) ?? { pep: d.topic.pepNumber, title: d.topic.title, count: 0 };
    entry.count += 1;
    shaky.set(d.topic.slug, entry);
  }
  const worst = [...shaky.values()].sort((a, b) => b.count - a.count)[0];
  if (!worst) return "Every recovered decision is backed by verified quotes.";
  const name = worst.pep !== null ? `PEP ${worst.pep}` : worst.title;
  return worst.count === 1
    ? `${name}: 1 decision rests on quotes we couldn't match to its post.`
    : `${name}: ${worst.count} decisions rest on quotes we couldn't match to their post.`;
}

export function overviewKpis(topics: TopicSummary[], decisions: DecisionSummary[]): Kpi[] {
  const total = topics.reduce((sum, t) => sum + t.decisionCount, 0);
  const rejected = topics.reduce((sum, t) => sum + t.rejectedCount, 0);
  const verified = decisions.reduce((sum, d) => sum + d.verifiedEvidence, 0);
  const quotes = decisions.reduce((sum, d) => sum + d.totalEvidence, 0);
  const recalls = topics.map((t) => t.lastRecall).filter((r): r is number => r !== null);
  const meanRecall = recalls.length ? recalls.reduce((a, b) => a + b, 0) / recalls.length : null;
  return [
    { label: "Decisions recovered", value: formatCount(total), sub: `from ${topics.length} discussions` },
    { label: "Rejected ideas", value: formatCount(rejected), sub: "with their reasons" },
    {
      label: "Quotes verified",
      value: formatPercent(quotes ? verified / quotes : null),
      sub: `${formatCount(verified)} of ${formatCount(quotes)} quotes found in their post`,
    },
    {
      label: "Recall against the PEP",
      value: formatPercent(meanRecall),
      sub: recalls.length ? `mean of ${recalls.length} evaluated PEPs` : "no PEP evaluated yet",
    },
  ];
}
