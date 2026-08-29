"use client";

import type { ReactNode } from "react";

/** A titled group inside a list screen (Expiration's date buckets,
 * Reminders' per-list groups). Same bordered-card shell the Log page uses
 * for its category groups, so grouped lists across the app read alike:
 * an icon + label + count on a hairline-ruled header, rows below. `accent`
 * colours the icon and label when a group needs emphasis (e.g. an overdue
 * bucket). */
export function ListSection({
  icon,
  label,
  count,
  accent,
  children,
}: {
  icon?: ReactNode;
  label: string;
  count?: number;
  accent?: string;
  children: ReactNode;
}) {
  const headColor = accent ?? "var(--text-muted)";
  return (
    <section className="flex flex-col rounded-lg border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
      <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: "var(--border-hairline)" }}>
        {icon && (
          <span className="shrink-0" style={{ color: headColor }} aria-hidden="true">
            {icon}
          </span>
        )}
        <h3 className="text-xs font-semibold" style={{ color: headColor }}>
          {label}
        </h3>
        {count != null && (
          <span className="ml-auto text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
            {count}
          </span>
        )}
      </div>
      <div className="px-3">{children}</div>
    </section>
  );
}

export function SectionIcon({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
