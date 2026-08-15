export function ComparisonBars({
  withLabel,
  withPct,
  withCount,
  withTotal,
  withoutLabel,
  withoutPct,
  withoutCount,
  withoutTotal,
}: {
  withLabel: string;
  withPct: number;
  withCount: number;
  withTotal: number;
  withoutLabel: string;
  withoutPct: number;
  withoutCount: number;
  withoutTotal: number;
}) {
  const max = Math.max(withPct, withoutPct, 1);
  return (
    <div className="flex flex-col gap-2.5">
      {[
        { label: withLabel, pct: withPct, count: withCount, total: withTotal, color: "var(--series-1)" },
        { label: withoutLabel, pct: withoutPct, count: withoutCount, total: withoutTotal, color: "var(--series-other)" },
      ].map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
            <span className="tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
              {row.pct}%{" "}
              <span className="font-normal" style={{ color: "var(--text-muted)" }}>
                ({row.count}/{row.total})
              </span>
            </span>
          </div>
          <div className="h-2 w-full rounded-full" style={{ background: "var(--page-plane)" }}>
            <div
              className="h-2 rounded-full"
              style={{ width: `${(row.pct / max) * 100}%`, background: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
