import type { CodeAnchor } from "@dejaview/shared";
import { Ref } from "../ui/Ref";
import styles from "./decision.module.css";

const METHOD: Record<CodeAnchor["linkMethod"], string> = {
  pr_ref: "Linked through a pull request named in the discussion",
  path_mention: "The discussion names this file",
  symbol_mention: "The discussion names this symbol",
};

export function AnchorList({ anchors }: { anchors: CodeAnchor[] }) {
  if (!anchors.length) return <p className={styles.empty}>No code is linked to this decision.</p>;
  return (
    <ul className={styles.anchors}>
      {anchors.map((a, i) => {
        const href = a.currentPath ? `https://github.com/${a.repo}/blob/main/${a.currentPath}` : undefined;
        return (
          <li key={`${a.originalPath}-${a.symbol}-${i}`} className={styles.anchor}>
            <span className={styles.anchorPath}>
              {a.currentPath
                ? <Ref kind="path" value={a.currentPath} href={href} title="Open on GitHub" />
                : <span className={`${styles.gone} mono`}>{a.originalPath}</span>}
              {a.symbol && <Ref kind="symbol" value={a.symbol} />}
            </span>
            <span className={styles.anchorNote}>{METHOD[a.linkMethod]}</span>
            {a.relocatedBy && a.currentPath && (
              <span className={styles.anchorNote}>
                Renamed from <Ref kind="path" value={a.originalPath} /> ({a.relocatedBy === "git-follow" ? "followed with git log --follow" : "found by symbol search"})
              </span>
            )}
            {a.currentPath === null && <span className={styles.anchorNote}>Not found at HEAD: the file was removed or moved beyond tracking.</span>}
          </li>
        );
      })}
    </ul>
  );
}
