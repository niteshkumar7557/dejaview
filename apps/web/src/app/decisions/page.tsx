import type { Metadata } from "next";
import { DecisionsTable } from "@/components/tables/DecisionsTable";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageTitle } from "@/components/ui/PageTitle";
import { formatCount } from "@/lib/format";
import { parseDecisionQuery } from "@/lib/search-params";
import { getSource } from "@/lib/source";
import styles from "./decisions.module.css";

export const metadata: Metadata = { title: "Decisions" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function DecisionsPage({ searchParams }: { searchParams: Search }) {
  const query = parseDecisionQuery(await searchParams);
  const source = getSource();
  const [results, everything, topics] = await Promise.all([
    source.searchDecisions(query),
    source.searchDecisions({}),
    source.listTopics(),
  ]);
  const filtered = Object.keys(query).length > 0;
  const noun = results.length === 1 ? "decision" : "decisions";

  return (
    <div className={styles.stack}>
      <PageTitle
        title="Decisions"
        subline={`${formatCount(everything.length)} decisions recovered from ${topics.length} discussions. Search before you propose: it may have been settled already.`}
      />
      <form className={styles.filters} action="/decisions" method="get" role="search" aria-label="Filter decisions">
        <label className={styles.field}>
          <span className="visually-hidden">Search</span>
          <input type="search" name="q" defaultValue={query.q ?? ""} placeholder="Search titles and reasons" />
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Status</span>
          <select name="status" defaultValue={query.status ?? ""}>
            <option value="">Any status</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="open">Open</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className="visually-hidden">Discussion</span>
          <select name="topic" defaultValue={query.topic ?? ""}>
            <option value="">All discussions</option>
            {topics.map((t) => (
              <option key={t.slug} value={t.slug}>{t.pepNumber !== null ? `PEP ${t.pepNumber}` : t.title}</option>
            ))}
          </select>
        </label>
        <label className={styles.check}>
          <input type="checkbox" name="verified" defaultChecked={query.verified === true} />
          Every quote verified
        </label>
        <Button type="submit" variant="secondary">Apply</Button>
        <p className={`${styles.count} num`} aria-live="polite">
          {formatCount(results.length)} {noun}{filtered && <> · <a href="/decisions">Clear filters</a></>}
        </p>
      </form>
      {results.length ? (
        <DecisionsTable decisions={results} showTopic caption="Matching decisions" />
      ) : (
        <>
          <EmptyState sentence={query.q ? `No decisions match “${query.q}”. Try fewer words, or browse every decision below.` : "No decisions match these filters. Every decision is listed below."} />
          <section aria-labelledby="all-title" className={styles.stack}>
            <h2 id="all-title" className={styles.sectionTitle}>All {formatCount(everything.length)} decisions</h2>
            <DecisionsTable decisions={everything} showTopic caption="All decisions" />
          </section>
        </>
      )}
    </div>
  );
}
