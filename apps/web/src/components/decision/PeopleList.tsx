import styles from "./decision.module.css";

// Pale identity tints, 60° apart around the hue wheel; never used as data colours.
const TINTS = ["#e3f0f2", "#e6edf9", "#efe8f7", "#f7e7ee", "#f6ece0", "#e7f3e6"];

export function PeopleList({ people, quoteCounts }: { people: string[]; quoteCounts: Record<string, number> }) {
  return (
    <ul className={styles.people}>
      {people.map((name, i) => (
        <li key={name} className={styles.person}>
          <span className={styles.avatar} style={{ background: TINTS[i % TINTS.length] }} aria-hidden="true">
            {name.replace(/[^a-z]/gi, "").slice(0, 1).toUpperCase()}
          </span>
          <span>
            {name}
            <span className={styles.personMeta}> · {quoteCounts[name] === 1 ? "1 quote" : `${quoteCounts[name] ?? 0} quotes`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
