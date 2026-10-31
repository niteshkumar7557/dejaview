import type { Metadata } from "next";
import Link from "next/link";
import { GroundTruthTable } from "@/components/eval/GroundTruthTable";
import { RecallBars } from "@/components/eval/RecallBars";
import styles from "@/components/eval/eval.module.css";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { formatPercent, ofTotal } from "@/lib/format";
import { matchedCount } from "@/lib/eval";
import { getSource, usingMocks } from "@/lib/source";

export const metadata: Metadata = { title: "Evaluation" };
export const dynamic = "force-dynamic";

export default async function EvalPage() {
  const source = getSource();
  const [runs, decisions] = await Promise.all([source.listEvalRuns(), source.searchDecisions({})]);
  const items = runs.reduce((sum, r) => sum + r.groundTruth.length, 0);
  const matched = runs.reduce((sum, r) => sum + matchedCount(r), 0);

  return (
    <div className={styles.stack}>
      <PageTitle
        title="Evaluation"
        subline={
          runs.length
            ? `Across ${runs.length} PEPs we recovered ${ofTotal(matched, items)} rejected ideas (${formatPercent(items ? matched / items : null)}) from the discussions alone. The model never saw the PEPs; we compare afterwards with each PEP's Rejected Ideas section.`
            : "We give the model each PEP's discussion without the PEP, then compare what it found with the PEP's Rejected Ideas section."
        }
        actions={
          <>
            <span className={styles.disabledNote}>{usingMocks ? "Runs against the live API" : "Started from the worker for now"}</span>
            <Button variant="primary" disabled title="Evaluation runs are started by the worker until the API exposes POST /api/eval/:slug to the web app">Run evaluation</Button>
          </>
        }
      />
      <Card title="Recall per PEP" id="recall" meta="Rejected ideas recovered">
        {runs.length ? <RecallBars runs={runs} /> : <EmptyState sentence="No PEP has been evaluated yet." />}
      </Card>
      {runs.map((run) => (
        <section key={run.id} aria-labelledby={`pep-${run.pepNumber}-title`}>
          <div className={styles.sectionHead} id={`pep-${run.pepNumber}`}>
            <h2 id={`pep-${run.pepNumber}-title`} className={styles.sectionTitle}>PEP {run.pepNumber}: {run.topic.title}</h2>
            <span className={styles.sectionMeta}>
              {ofTotal(matchedCount(run), run.groundTruth.length)} recovered · evaluated {run.createdAt.slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <GroundTruthTable run={run} decisions={decisions} />
          <p className={styles.extra}>
            {run.extraIdeas === 0
              ? "Every rejected idea DejaView found is also listed in the PEP."
              : <>{run.extraIdeas === 1 ? "1 more rejected idea" : `${run.extraIdeas} more rejected ideas`} found in the discussion that the PEP does not list. <Link href={`/topics/${run.topic.slug}?tab=decisions&status=rejected`}>See them</Link></>}
          </p>
        </section>
      ))}
    </div>
  );
}
