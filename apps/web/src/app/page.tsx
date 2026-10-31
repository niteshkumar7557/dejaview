import type { Metadata } from "next";
import Link from "next/link";
import { DecisionsTable } from "@/components/tables/DecisionsTable";
import { PrCheckRows } from "@/components/tables/PrCheckRows";
import { TopicsTable } from "@/components/tables/TopicsTable";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { PageTitle } from "@/components/ui/PageTitle";
import { overviewFinding, overviewKpis } from "@/lib/overview";
import { getSource } from "@/lib/source";
import styles from "./overview.module.css";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const source = getSource();
  const [topics, decisions, checks] = await Promise.all([
    source.listTopics(),
    source.searchDecisions({}),
    source.listPrChecks(),
  ]);
  const rows = topics.map((topic) => {
    const own = decisions.filter((d) => d.topic.slug === topic.slug);
    return {
      topic,
      verified: own.reduce((sum, d) => sum + d.verifiedEvidence, 0),
      quotes: own.reduce((sum, d) => sum + d.totalEvidence, 0),
    };
  });

  const rejected = decisions.filter((d) => d.status === "rejected");

  return (
    <div className={styles.stack}>
      <PageTitle
        title="Overview"
        subline={overviewFinding(decisions)}
        actions={<ButtonLink href="/ingest" variant="primary">Ingest a discussion</ButtonLink>}
      />
      <KpiStrip items={overviewKpis(topics, decisions)} />
      <div className={styles.row}>
        <Card title="Discussions" id="discussions" meta={`${topics.length} ingested`}>
          {rows.length ? <TopicsTable rows={rows} /> : <EmptyState sentence="No discussions ingested yet." />}
        </Card>
        <Card title="Latest PR checks" id="pr-checks" meta={<Link href="/pr-checks">View all</Link>}>
          {checks.length ? <PrCheckRows checks={checks.slice(0, 4)} /> : <EmptyState sentence="No pull requests checked yet." />}
        </Card>
      </div>
      <Card title="Rejected ideas" id="rejected" meta={<Link href="/decisions?status=rejected">All {rejected.length}</Link>}>
        <DecisionsTable decisions={rejected.slice(0, 5)} showTopic caption="Rejected ideas" />
      </Card>
    </div>
  );
}
