import type { Metadata } from "next";
import { IngestPanel } from "@/components/ingest/IngestPanel";
import { PageTitle } from "@/components/ui/PageTitle";

export const metadata: Metadata = { title: "Ingest" };

export default function IngestPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <PageTitle
        title="Ingest a discussion"
        subline="DejaView reads the thread, keeps the posts that argue for or against something, and writes each decision with quotes it can check. On the laptop GPU a 300-post thread takes several minutes."
      />
      <IngestPanel />
    </div>
  );
}
