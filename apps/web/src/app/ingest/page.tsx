import type { Metadata } from "next";
import { IngestPanel } from "@/components/ingest/IngestPanel";
import { TopicsTable } from "@/components/tables/TopicsTable";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { getSource } from "@/lib/source";

export const metadata: Metadata = { title: "Ingest" };
export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const source = getSource();
  const [topics, decisions] = await Promise.all([source.listTopics(), source.searchDecisions({})]);
  const rows = topics.map((topic) => {
    const own = decisions.filter((d) => d.topic.slug === topic.slug);
    return {
      topic,
      verified: own.reduce((sum, d) => sum + d.verifiedEvidence, 0),
      quotes: own.reduce((sum, d) => sum + d.totalEvidence, 0),
    };
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--section-gap)" }}>
      <PageTitle
        title="Ingest a discussion"
        subline="DejaView reads the thread, keeps the posts that argue for or against something, and writes each decision with quotes it can check. On the laptop GPU a 300-post thread takes several minutes."
      />
      <IngestPanel />
      {rows.length > 0 && (
        <Card title="Already ingested" id="ingested" meta="Ingesting one again replaces its decisions">
          <TopicsTable rows={rows} />
        </Card>
      )}
    </div>
  );
}
