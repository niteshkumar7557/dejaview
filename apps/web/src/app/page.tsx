import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiStrip } from "@/components/ui/KpiStrip";
import { PageTitle } from "@/components/ui/PageTitle";
import { Ref } from "@/components/ui/Ref";
import { StatusPill } from "@/components/ui/StatusPill";
import { Tabs } from "@/components/ui/Tabs";
import { VerifiedMark } from "@/components/ui/VerifiedMark";

// Temporary primitives page (Task 4); replaced by the Overview in Task 6.
export default function OverviewPage() {
  return (
    <>
      <PageTitle title="Overview" subline="Primitives preview." actions={<ButtonLink href="/ingest" variant="primary">Ingest a discussion</ButtonLink>} />
      <KpiStrip items={[{ label: "Decisions recovered", value: "20" }, { label: "Rejected ideas", value: "12" }, { label: "Quotes verified", value: "94%", sub: "44 of 47 quotes" }]} />
      <div style={{ display: "flex", gap: 12, margin: "24px 0", flexWrap: "wrap", alignItems: "center" }}>
        <StatusPill status="accepted" /><StatusPill status="rejected" /><StatusPill status="withdrawn" /><StatusPill status="open" />
        <VerifiedMark verified score={1} /><VerifiedMark verified={false} score={0.58} />
        <Ref kind="post" value="142" href="/" /><Ref kind="pep" value="701" /><Ref kind="path" value="Lib/typing.py" />
      </div>
      <Tabs label="Topic" items={[{ href: "/?tab=a", label: "Decisions", active: true }, { href: "/?tab=b", label: "Timeline", active: false }]} />
      <Card title="Empty block"><EmptyState sentence="No decisions match “zzz”." /></Card>
    </>
  );
}
