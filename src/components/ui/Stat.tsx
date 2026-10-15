/** One headline figure — a small label above its number. Goes inside a
 * `<dl>` grid, two columns on a phone. */
export function Stat({ label, value, detail, accent }: { label: string; value: string; detail?: string; accent?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs leading-tight" style={{ color: "var(--text-secondary)" }}>
        {label}
      </dt>
      <dd className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-base leading-tight font-semibold tabular-nums" style={{ color: accent ?? "var(--text-primary)" }}>
          {value}
        </span>
        {detail && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {detail}
          </span>
        )}
      </dd>
    </div>
  );
}
