"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

/** A titled group inside a list screen (Expiration's date buckets,
 * Reminders' per-list groups, the Agenda urgency buckets). Same
 * bordered-card shell the Log page uses for its category groups, so
 * grouped lists across the app read alike: an icon + label + count on a
 * hairline-ruled header, rows below. `accent` colours the icon and label
 * when a group needs emphasis (e.g. an overdue bucket).
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
      <h3 className="text-xs font-semibold" style={{ color: headColor }}>
        {label}
      </h3>
      {count != null && (
        <span className="ml-auto text-xs font-medium tabular-nums" style={{ color: "var(--text-muted)" }}>
          {count}
        </span>
      )}
    </>
  );

  // `accent` marks urgency (Agenda's Overdue/Today buckets), not just a
  // label colour — the whole card picks up a faint tint and a tinted
  // border so an urgent group reads as visually heavier than a routine one,
  // not just differently-coloured text on an otherwise identical card.
  const cardBorder = accent ? `color-mix(in oklab, ${accent} 35%, var(--border-hairline))` : "var(--border-hairline)";
  const cardBackground = accent ? `color-mix(in oklab, ${accent} 6%, var(--surface-1))` : "var(--surface-1)";

  return (
    <section className="flex flex-col rounded-lg border" style={{ borderColor: cardBorder, background: cardBackground }}>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1.5 px-3 py-2 text-left"
          style={{ borderBottom: shown ? `1px solid ${cardBorder}` : "none" }}
        >
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-1.5 border-b px-3 py-2" style={{ borderColor: cardBorder }}>
          {head}
        </div>
      )}
      {shown && <div className="px-3">{children}</div>}
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
