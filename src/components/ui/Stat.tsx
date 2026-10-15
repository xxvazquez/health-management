import type { ReactNode } from "react";

/** A set of headline figures laid out as an aligned grid — two columns on
 * a phone, more on wider screens — each a small label above its number.
 * Use it for any row of several stats; `StatChip` is only for a single
 * figure sitting inline in a sentence or card. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-4">{children}</dl>;
}

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
