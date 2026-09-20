"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

/** A titled group inside a list screen (Expiration's date buckets,
 * Reminders' per-list groups, the Agenda urgency buckets): an iOS-style
 * section header — small uppercase label and count — above a white card of
 * rows. `accent` colours the label when a group needs emphasis (e.g. an
 * overdue bucket).
 *
 * Pass `collapsible` to make the header a toggle (a chevron replaces the
 * icon); `defaultOpen` sets its initial state. */
export function ListSection({
  icon,
  label,
  count,
  accent,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  icon?: ReactNode;
  label: string;
  count?: number;
  accent?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const shown = !collapsible || open;
  const headColor = accent ?? "var(--text-muted)";

  const head = (
    <>
      {collapsible ? (
        <span className="shrink-0" style={{ color: headColor }} aria-hidden="true">
          <ChevronIcon dir={open ? "down" : "right"} size={13} />
        </span>
      ) : (
        icon && (
          <span className="shrink-0" style={{ color: headColor }} aria-hidden="true">
            {icon}
          </span>
        )
      )}
      <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: headColor }}>
        {label}
      </h3>
      {count != null && (
        <span className="ml-auto text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
          {count}
        </span>
      )}
    </>
  );

  return (
    <section className="flex flex-col gap-1.5">
      {collapsible ? (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-8 items-center gap-1.5 px-3.5 text-left">
          {head}
        </button>
      ) : (
        <div className="flex min-h-8 items-center gap-1.5 px-3.5">{head}</div>
      )}
      {shown && (
        <div className="rounded-xl border px-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          {children}
        </div>
      )}
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
