import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnchorList } from "@/components/decision/AnchorList";
import { AuditDrawer } from "@/components/decision/AuditDrawer";
import { MadrButton } from "@/components/decision/MadrButton";
import { PeopleList } from "@/components/decision/PeopleList";
import { ReasonList } from "@/components/decision/ReasonList";
import styles from "@/components/decision/decision.module.css";
import { HighlightProvider } from "@/components/thread-strip/HighlightContext";
import { ThreadStrip } from "@/components/thread-strip/ThreadStrip";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { StatusPill, statusLabel } from "@/components/ui/StatusPill";
import { formatDate } from "@/lib/format";
import { getSource } from "@/lib/source";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

async function load(idText: string) {
  const id = Number(idText);
  if (!Number.isInteger(id) || id < 1) return null;
  return getSource().getDecision(id);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const card = await load((await params).id);
  return { title: card ? card.title : "Not found" };
}

export default async function DecisionPage({ params }: { params: Params }) {
  const card = await load((await params).id);
  if (!card) notFound();
  const source = getSource();
  const [calls, posts] = await Promise.all([source.getLlmCalls(card.id), source.getTimeline(card.topic.slug)]);

  const name = card.topic.pepNumber !== null ? `PEP ${card.topic.pepNumber}` : card.topic.title;
  const evidence = card.reasons.flatMap((r) => r.evidence);
  const noneVerified = evidence.length > 0 && evidence.every((e) => !e.verified);
  const quoteCounts = evidence.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.author]: (acc[e.author] ?? 0) + 1 }), {});
  const decided = card.decidedAt ? `decided ${formatDate(card.decidedAt)}` : "not decided yet";

  return (
    <HighlightProvider initial={card.id}>
      <div className={styles.main} style={{ gap: "var(--gap)" }}>
        <PageTitle
          crumbs={[{ href: "/", label: "Overview" }, { href: `/topics/${card.topic.slug}`, label: name }, { href: `/decisions/${card.id}`, label: "Decision" }]}
          title={card.title}
          badge={<StatusPill status={card.status} />}
          subline={`${statusLabel(card.status)} in ${name}, ${decided}. Recovered by ${card.model}, ${card.confidence} confidence.`}
          actions={<MadrButton card={card} />}
        />
        <div className={styles.layout}>
          <div className={styles.main}>
            <p className={styles.summary}>{card.summary}</p>
            {noneVerified && (
              <p className={styles.notice} role="note">
                No quote could be matched to its post. Treat this decision as unconfirmed until someone checks the thread.
              </p>
            )}
            <section aria-labelledby="reasons-title">
              <h2 id="reasons-title" className={styles.sectionTitle}>
                {card.status === "rejected" ? "Why it was rejected" : card.status === "accepted" ? "Why it was accepted" : "Reasons given"}
              </h2>
              <ReasonList reasons={card.reasons} topicSlug={card.topic.slug} />
            </section>
            {posts && (
              <section aria-labelledby="where-title">
                <h2 id="where-title" className={styles.sectionTitle}>Where this came from in the discussion</h2>
                <ThreadStrip posts={posts} linkBase={`/topics/${card.topic.slug}?tab=timeline`} height={40} label={`${name} discussion`} />
              </section>
            )}
          </div>
          <div className={styles.rail}>
            <Card title="Linked code" id="code">
              <AnchorList anchors={card.anchors} />
            </Card>
            <Card title="People" id="people" meta={`${card.people.length} in the evidence`}>
              <PeopleList people={card.people} quoteCounts={quoteCounts} />
            </Card>
            <Card title="Audit trail" id="audit">
              <AuditDrawer calls={calls} />
            </Card>
          </div>
        </div>
      </div>
    </HighlightProvider>
  );
}
