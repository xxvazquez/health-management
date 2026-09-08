/** Compact headline figure — a bordered pill, not a full stat card. Used
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
      className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 rounded-md border px-2.5 py-1 text-xs"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <strong className="text-sm font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
        {value}
      </strong>
      {detail && <span style={{ color: "var(--text-muted)" }}>{detail}</span>}
    </span>
  );
}
