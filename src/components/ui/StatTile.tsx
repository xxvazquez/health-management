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
    <Card tier="raw">
      <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        {label}
      </p>
      <p
        className="mt-1.5 text-xl font-semibold tabular-nums"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {value}
      </p>
      {detail && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {detail}
        </p>
      )}
    </Card>
  );
}
