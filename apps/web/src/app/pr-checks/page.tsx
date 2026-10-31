import type { Metadata } from "next";
import Link from "next/link";
import { CommentPreview } from "@/components/pr/CommentPreview";
import styles from "@/components/pr/pr.module.css";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { Ref } from "@/components/ui/Ref";
import { prCheckResult, prTitle, selectCheck } from "@/lib/pr-checks";
import { getSource } from "@/lib/source";

export const metadata: Metadata = { title: "PR checks" };
export const dynamic = "force-dynamic";

type Search = Promise<{ pr?: string }>;

export default async function PrChecksPage({ searchParams }: { searchParams: Search }) {
  const { pr } = await searchParams;
  const checks = await getSource().listPrChecks();
  const selected = selectCheck(checks, pr);
  const latest = checks[0]?.createdAt;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <PageTitle
        title="PR checks"
        subline={latest
          ? `Every pull request on the CPython fork is checked against past decisions. Last check ${latest.slice(0, 16).replace("T", " ")}.`
          : "Every pull request on the CPython fork is checked against past decisions."}
      />
      {checks.length && selected ? (
        <div className={styles.layout} data-selected={pr ? "true" : "false"}>
          <div className={styles.side}>
          <nav aria-label="Checked pull requests">
            <ul className={styles.list}>
              {checks.map((c) => (
                <li key={c.id}>
                  <Link href={`/pr-checks?pr=${c.id}`} scroll={false} className={styles.row} aria-current={c.id === selected.id ? "true" : undefined}>
                    <Ref kind="post" value={String(c.request.prNumber)} />
                    <span className={styles.title}>{prTitle(c)}</span>
                    <span className={`${styles.meta} ${c.decisionIds.length || c.similarRejectedIds.length ? styles.hit : ""}`}>{prCheckResult(c)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <section aria-labelledby="how-title" className={styles.how}>
            <h2 id="how-title" className={styles.howTitle}>How a pull request is checked</h2>
            <ol>
              <li>The GitHub Action sends the changed files, renamed paths and the function and class names from the diff.</li>
              <li>They are matched against the code linked to every recovered decision, following renames.</li>
              <li>The title and description are searched against rejected ideas, to catch a re-proposal.</li>
              <li>The bot posts one comment and updates it on every push. No model call: it is instant and repeatable.</li>
            </ol>
          </section>
          </div>
          <div>
            <Link href="/pr-checks" className={styles.back}>All pull requests</Link>
            <CommentPreview check={selected} />
          </div>
        </div>
      ) : (
        <EmptyState sentence="No pull requests have been checked yet. Install the GitHub Action on the fork to start." />
      )}
    </div>
  );
}
