import { type DecisionStatus, TRIAGE_LABELS, type TimelinePost, type TriageLabel } from "@dejaview/shared";

export type TimelineItem =
  | { type: "post"; post: TimelinePost }
  | { type: "filtered"; posts: TimelinePost[] };

/** Thread order, with every run of consecutive filtered posts folded into one item. */
export function groupTimeline(posts: TimelinePost[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const post of posts) {
    const last = items[items.length - 1];
    if (!post.skipped) items.push({ type: "post", post });
    else if (last?.type === "filtered") last.posts.push(post);
    else items.push({ type: "filtered", posts: [post] });
  }
  return items;
}

export type StatusCounts = Record<DecisionStatus | "all", number>;

export function statusCounts(decisions: { status: DecisionStatus }[]): StatusCounts {
  const counts: StatusCounts = { all: decisions.length, accepted: 0, rejected: 0, withdrawn: 0, open: 0 };
  for (const d of decisions) counts[d.status] += 1;
  return counts;
}

export const TRIAGE_TEXT: Record<TriageLabel, string> = {
  proposal: "Proposal", alternative: "Alternative", objection: "Objection", support: "Support",
  decision: "Decision", question: "Question", noise: "Noise",
};

/** Posts per triage label (in label order), then the posts filtered out before the model. */
export function labelCounts(posts: TimelinePost[]): { label: string; count: number }[] {
  const rows = TRIAGE_LABELS.map((l) => ({ label: TRIAGE_TEXT[l], count: posts.filter((p) => !p.skipped && p.triageLabel === l).length }));
  return [...rows, { label: "Filtered before the model", count: posts.filter((p) => p.skipped).length }];
}
