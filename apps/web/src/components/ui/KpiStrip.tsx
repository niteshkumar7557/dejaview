import styles from "./ui.module.css";

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
}

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <dl className={styles.kpis}>
      {items.map((item) => (
        <div key={item.label} className={styles.kpi}>
          <dt className={styles.kpiLabel}>{item.label}</dt>
          <dd className={styles.kpiValue} style={{ margin: 0 }}>{item.value}</dd>
          {item.sub && <dd className={styles.kpiSub} style={{ margin: 0 }}>{item.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}
