/** DejaView's mark: two overlapping speech bubbles, a debate seen twice. */
export function Mark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2.5 4.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6.5l-2.5 2.2V10.4a2 2 0 0 1-1.5-1.9z"
        stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 9.5a2 2 0 0 1 2-2h5.5a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-.5v2.2l-2.5-2.2H10a2 2 0 0 1-2-2z"
        fill="var(--accent)" />
    </svg>
  );
}
