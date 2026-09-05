"use client";

import { useMemo, useState } from "react";
import { DOMAIN_ACCENT, DOMAIN_ICON, DOMAIN_LABEL, ALL_DOMAINS } from "./domainStyle";
import { ShowMore } from "@/components/ui/ShowMore";
import type { ActivityDomain, ActivityEntry } from "@/lib/aggregations/activity";

function formatDateHeader(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Read-only cross-domain feed for Overview's "Recent activity" — a date
 * header, a connecting dot rail, domain-colored rows, an optional category
 * filter (`showFilter`) and load-more pagination. Deliberately not the Log
 * page's day timeline: nothing here is editable — no edit/delete, no note
 * field, no meal-tag correction — this is for understanding what happened,
 * not managing records (see the Log page for that).
 */
export function ActivityFeed({
  entries,
  showFilter = false,
  initialLimit = 12,
  pageSize = 20,
  emptyText = "Nothing logged yet.",
}: {
  entries: ActivityEntry[];
  showFilter?: boolean;
  initialLimit?: number;
  pageSize?: number;
  emptyText?: string;
}) {
  const [activeDomains, setActiveDomains] = useState<Set<ActivityDomain>>(new Set(ALL_DOMAINS));
  const [limit, setLimit] = useState(initialLimit);

  const filtered = useMemo(
    () => (showFilter ? entries.filter((e) => activeDomains.has(e.domain)) : entries),
    [entries, showFilter, activeDomains],
  );
  const visible = filtered.slice(0, limit);

  // Group consecutive same-date entries under one date header + dot rail.
  const groups = useMemo(() => {
    const out: { date: string; items: ActivityEntry[] }[] = [];
    for (const e of visible) {
      const last = out.at(-1);
      if (last && last.date === e.date) last.items.push(e);
      else out.push({ date: e.date, items: [e] });
    }
    return out;
  }, [visible]);

  function toggleDomain(d: ActivityDomain) {
    setActiveDomains((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      // Never allow filtering down to nothing — that reads as a bug, not a
      // valid "show me none of it" state.
      return next.size === 0 ? new Set(ALL_DOMAINS) : next;
    });
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {emptyText}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {showFilter && (
        <div className="flex flex-wrap gap-1.5">
          {ALL_DOMAINS.map((d) => {
            const active = activeDomains.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDomain(d)}
                aria-pressed={active}
                className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  borderColor: active ? DOMAIN_ACCENT[d] : "var(--border-hairline)",
                  background: active ? `color-mix(in oklab, ${DOMAIN_ACCENT[d]} 14%, var(--surface-1))` : "transparent",
                  color: active ? DOMAIN_ACCENT[d] : "var(--text-secondary)",
                }}
              >
                {DOMAIN_ICON[d]}
                {DOMAIN_LABEL[d]}
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          No activity for this filter.
        </p>
      ) : (
        <div className="flex flex-col">
          {groups.map((group, gi) => (
            <div key={group.date} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--text-muted)" }} />
                {gi < groups.length - 1 && <span className="w-px flex-1" style={{ background: "var(--gridline)" }} />}
              </div>
              <div className={gi < groups.length - 1 ? "min-w-0 flex-1 pb-3" : "min-w-0 flex-1"}>
                <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  {formatDateHeader(group.date)}
                </p>
                <div className="mt-1 flex flex-col gap-1.5">
                  {group.items.map((e) => (
                    <div key={e.key} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span style={{ color: DOMAIN_ACCENT[e.domain] }}>{DOMAIN_ICON[e.domain]}</span>
                      <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                        {e.label}
                      </span>
                      <span style={{ color: "var(--text-secondary)" }}>— {e.description}</span>
                      {e.time && (
                        <span className="ml-auto shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {e.time}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ShowMore hiddenCount={filtered.length - limit} onClick={() => setLimit((l) => l + pageSize)} />
    </div>
  );
}
