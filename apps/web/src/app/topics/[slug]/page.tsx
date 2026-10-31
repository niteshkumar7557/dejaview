import type { DecisionStatus } from "@dejaview/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DecisionsTable } from "@/components/tables/DecisionsTable";
import { HighlightProvider } from "@/components/thread-strip/HighlightContext";
import { ThreadRail } from "@/components/thread-strip/ThreadRail";
import { ThreadStrip } from "@/components/thread-strip/ThreadStrip";
import { Timeline } from "@/components/thread-strip/Timeline";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { Tabs } from "@/components/ui/Tabs";
import { formatCount, plural, topicHeading } from "@/lib/format";
import { getTopicOnce } from "@/lib/cached";
import { getSource } from "@/lib/source";
import { statusCounts } from "@/lib/timeline";
import styles from "./topic.module.css";

export const dynamic = "force-dynamic";

const STATUSES: DecisionStatus[] = ["accepted", "rejected", "withdrawn", "open"];
const STATUS_TEXT: Record<DecisionStatus, string> = { accepted: "Accepted", rejected: "Rejected", withdrawn: "Withdrawn", open: "Open" };
const SOURCE_TEXT = { discourse: "discuss.python.org thread", github_issue: "GitHub issue", github_pr: "GitHub pull request", upload: "uploaded file" } as const;

type Params = Promise<{ slug: string }>;
type Search = Promise<{ tab?: string; status?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getTopicOnce(slug);
  return { title: topic ? (topic.pepNumber ? `PEP ${topic.pepNumber}` : topic.title) : "Not found" };
}

export default async function TopicPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { slug } = await params;
  const { tab = "decisions", status } = await searchParams;
  const source = getSource();
  const [topic, posts] = await Promise.all([getTopicOnce(slug), source.getTimeline(slug)]);
  if (!topic || !posts) notFound();

  const base = `/topics/${slug}`;
  const counts = statusCounts(topic.decisions);
  const activeStatus = STATUSES.find((s) => s === status);
  const shown = activeStatus ? topic.decisions.filter((d) => d.status === activeStatus) : topic.decisions;
  const titles = Object.fromEntries(topic.decisions.map((d) => [d.id, d.title]));
  const name = topic.pepNumber !== null ? `PEP ${topic.pepNumber}` : topic.title;

  return (
    <HighlightProvider>
      <div className={styles.stack}>
        <PageTitle
          crumbs={[{ href: "/", label: "Overview" }, { href: base, label: name }]}
          title={topicHeading(topic.pepNumber, topic.title)}
          subline={`${plural(posts.length, "post")} from ${plural(topic.sourceCount, "source")}. Posts read by qwen3.5:4b, decisions written by qwen3.5:9b.`}
          actions={<ButtonLink href={`/eval#pep-${topic.pepNumber ?? slug}`} variant="primary">Run evaluation</ButtonLink>}
        />
        <ul className={styles.sources}>
          {topic.sources.map((s) => (
            <li key={s.url ?? s.title}>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title ?? s.url}</a> : s.title}
              <span className={styles.muted}> · {SOURCE_TEXT[s.kind]}</span>
            </li>
          ))}
        </ul>
        <ThreadStrip posts={posts} linkBase={`${base}?tab=timeline`} label={`${name} discussion`} />
        <div>
          <Tabs
            label="Topic views"
            items={[
              { href: `${base}?tab=decisions`, label: `Decisions ${counts.all}`, active: tab !== "timeline" },
              { href: `${base}?tab=timeline`, label: `Timeline ${formatCount(posts.length)}`, active: tab === "timeline" },
            ]}
          />
          {tab === "timeline" ? (
            <div className={styles.timelineLayout}>
              <Timeline posts={posts} decisionTitles={titles} />
              <ThreadRail posts={posts} decisions={topic.decisions} />
            </div>
          ) : (
            <>
              <nav aria-label="Filter by status" className={styles.filters}>
                <Link href={`${base}?tab=decisions`} aria-current={!activeStatus ? "true" : undefined}>All {counts.all}</Link>
                {STATUSES.filter((s) => counts[s] > 0).map((s) => (
                  <Link key={s} href={`${base}?tab=decisions&status=${s}`} aria-current={activeStatus === s ? "true" : undefined}>
                    {STATUS_TEXT[s]} {counts[s]}
                  </Link>
                ))}
              </nav>
              {shown.length
                ? <DecisionsTable decisions={shown} caption={`Decisions in ${name}`} />
                : <EmptyState sentence="No decisions with this status in this discussion." />}
            </>
          )}
        </div>
      </div>
    </HighlightProvider>
  );
}
