import type { PrCheckView } from "@dejaview/shared";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { commentBody } from "@/lib/pr-checks";
import styles from "./pr.module.css";

/** The comment exactly as the bot posted it on the pull request. */
export function CommentPreview({ check }: { check: PrCheckView }) {
  return (
    <section className={styles.preview} aria-labelledby="comment-title">
      <div className={styles.previewHead}>
        <span id="comment-title"><strong>{check.request.repo}#{check.request.prNumber}</strong>{check.request.title.trim() ? <> · {check.request.title}</> : null}</span>
        <span>Commented {check.createdAt.slice(0, 16).replace("T", " ")}</span>
      </div>
      <div className={styles.comment}>
        <ReactMarkdown
          components={{
            h3: ({ children }) => <h3>{children}</h3>,
            a: ({ href, children }) => (href?.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a>),
          }}
        >
          {commentBody(check.commentMarkdown)}
        </ReactMarkdown>
      </div>
    </section>
  );
}
