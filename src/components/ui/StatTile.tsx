import { Card } from "./Card";

export function StatTile({
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
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p
        className="mt-2 text-2xl font-semibold tabular-nums"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          {detail}
        </p>
      )}
    </Card>
  );
}
