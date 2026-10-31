// Shown while a screen's data loads: the final layout with grey bars at real sizes, no shimmer.
const bar = (width: string, height: number) => (
  <span style={{ display: "block", width, height, borderRadius: 4, background: "var(--active)" }} />
);

export default function Loading() {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bar("240px", 28)}
        {bar("min(520px, 100%)", 20)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            {bar("60%", 20)}
            {bar("40%", 36)}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {[0, 1, 2, 3, 4].map((i) => <div key={i}>{bar("100%", 44)}</div>)}
      </div>
    </div>
  );
}
