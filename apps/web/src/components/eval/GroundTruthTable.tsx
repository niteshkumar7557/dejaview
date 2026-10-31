import type { EvalRunView } from "@dejaview/shared";
import Link from "next/link";
import { agreementText, decisionIdFromKey } from "@/lib/eval";
import styles from "./eval.module.css";

export function GroundTruthTable({ run, titles }: { run: EvalRunView; titles: Record<number, string> }) {
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
          const id = decisionIdFromKey(m.decisionKey);
          return (
            <tr key={m.groundTruth.title}>
              <td>
                <div className={styles.gtTitle}>{m.groundTruth.title}</div>
                <div className={styles.gtText}>{m.groundTruth.text}</div>
              </td>
              <td>
                {id !== null
                  ? <Link className={styles.found} href={`/decisions/${id}`}>{titles[id] ?? `Decision ${id}`}</Link>
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
