import type { EvalRunView } from "@dejaview/shared";
import Link from "next/link";
import { agreementText, resolveMatch } from "@/lib/eval";
import styles from "./eval.module.css";

export function GroundTruthTable({ run, decisions, keysAreIds }: {
  run: EvalRunView;
  decisions: { id: number; title: string; topic: { slug: string } }[];
  keysAreIds: boolean;
}) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">The PEP says (Rejected Ideas)</th>
          <th scope="col">DejaView found, from the discussion alone</th>
          <th scope="col">Reasons agree</th>
        </tr>
      </thead>
      <tbody>
        {run.matches.map((m) => {
          const found = resolveMatch(m, run.topic.slug, decisions, keysAreIds);
          return (
            <tr key={m.groundTruth.title}>
              <td>
                <div className={styles.gtTitle}>{m.groundTruth.title}</div>
                <div className={styles.gtText}>{m.groundTruth.text}</div>
              </td>
              <td>
                {found
                  ? <Link className={styles.found} href={`/decisions/${found.id}`}>{found.title}</Link>
                  : m.decisionKey
                    ? <span className={styles.missed}>Recovered as {m.decisionKey} in this run</span>
                    : <span className={styles.missed}>Not recovered</span>}
              </td>
              <td className={m.reasonAgreement === "no" ? styles.no : undefined}>{agreementText(m.reasonAgreement)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
