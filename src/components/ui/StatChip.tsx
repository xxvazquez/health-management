/** Compact headline figure — plain inline text, not a card or a pill. Used
 * for the small stat rows at the top of the Trends dashboards. Lay several
 * out in a `flex flex-wrap gap-2` row. */
export function StatChip({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
}) {
  return (
    <span
      className="inline-flex min-h-9 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm"
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <strong className="text-sm font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </strong>
      {detail && <span style={{ color: "var(--text-muted)" }}>{detail}</span>}
    </span>
  );
}
