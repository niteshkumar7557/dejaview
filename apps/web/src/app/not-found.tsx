import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageTitle } from "@/components/ui/PageTitle";
import { Ref } from "@/components/ui/Ref";
import { getSource } from "@/lib/source";

export default async function NotFound() {
  const topics = await getSource().listTopics().catch(() => []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <PageTitle
        title="Not found"
        subline="There is no discussion or decision at this address. It may not have been ingested yet."
        actions={<ButtonLink href="/ingest" variant="primary">Ingest a discussion</ButtonLink>}
      />
      <Card title="Discussions you can open" id="open">
        <ul style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {topics.map((t) => (
            <li key={t.slug} style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
              {t.pepNumber !== null && <Ref kind="pep" value={String(t.pepNumber)} />}
              <Link href={`/topics/${t.slug}`} style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>{t.title}</Link>
              <span style={{ color: "var(--muted)", fontSize: "var(--fs-small)" }}>{t.decisionCount} decisions</span>
            </li>
          ))}
          <li><Link href="/decisions" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>Search every decision</Link></li>
        </ul>
      </Card>
    </div>
  );
}
