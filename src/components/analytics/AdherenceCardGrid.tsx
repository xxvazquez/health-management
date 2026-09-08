"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { ItemActions } from "@/components/ui/ItemActions";
import { ChevronIcon } from "@/components/ui/icons";
import { HabitGridWeekdays, HabitMonthGrid, HabitYearBars } from "@/components/charts/HabitMonthGrid";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { addDaysToDate, computeLongestStreak, getDatasetSpan, listDatesBetween, monthStart, pct, todayLocalISODate } from "@/lib/aggregations/common";
import type { ItemStats } from "@/lib/aggregations/itemStats";
import type { CanonicalEvent } from "@/lib/types";

// A spread of palette hues so each row reads as its own thing at a glance —
// adjacent entries sit in different colour families.
const PALETTE = [
  "var(--series-2)",
  "var(--series-4)",
  "var(--series-1)",
  "var(--series-8)",
  "var(--series-6)",
  "var(--series-magenta)",
  "var(--series-indigo)",
  "var(--series-berry)",
  "var(--series-3)",
  "var(--series-slate)",
];

type View = "month" | "year";

/** Same bordered-group shape as the Log page's day nav. */
const NAV_GROUP = "flex items-center gap-0.5 rounded-md border p-0.5";
const NAV_GROUP_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)" } as const;

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div className={NAV_GROUP} style={NAV_GROUP_STYLE}>
      {(["month", "year"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="rounded px-2.5 py-1 text-xs font-semibold capitalize transition-colors"
          style={{
            background: value === v ? "var(--page-plane)" : "transparent",
            color: value === v ? "var(--text-primary)" : "var(--text-muted)",
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function PeriodNav({
  view,
  anchor,
  today,
  setAnchor,
  onShift,
  canPrev,
  canNext,
}: {
  view: View;
  anchor: string;
  today: string;
  setAnchor: (v: string) => void;
  onShift: (months: number) => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const step = view === "month" ? 1 : 12;
  const label =
    view === "month"
      ? new Date(`${anchor}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : anchor.slice(0, 4);
  return (
    <div className={NAV_GROUP} style={NAV_GROUP_STYLE}>
      <button
        type="button"
        onClick={() => onShift(-step)}
        disabled={!canPrev}
        aria-label="Previous"
        className="flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        <ChevronIcon dir="left" size={15} />
      </button>
      {view === "month" ? (
        <label className="relative flex min-w-[7.5rem] cursor-pointer items-center justify-center rounded px-1 py-1">
          <span className="text-xs font-semibold whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
            {label}
          </span>
          <input
            type="month"
            value={anchor.slice(0, 7)}
            max={monthStart(today).slice(0, 7)}
            onChange={(e) => e.target.value && setAnchor(`${e.target.value}-01`)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            aria-label="Pick a month"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      ) : (
        <span className="flex min-w-[7.5rem] items-center justify-center px-1 py-1 text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onShift(step)}
        disabled={!canNext}
        aria-label="Next"
        className="flex h-7 w-7 items-center justify-center rounded disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        <ChevronIcon dir="right" size={15} />
      </button>
    </div>
  );
}

/** Per calendar month of `year`: the consistency %, and how many days the
 * item was completed. `pct` is null for a month with no tracked days. */
function monthlyConsistency(year: number, doneDates: Set<string>, firstTracked: string, today: string): { pct: number | null; done: number }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
    const first = `${prefix}-01`;
    const last = `${prefix}-${String(new Date(year, m + 1, 0).getDate()).padStart(2, "0")}`;
    const start = first < firstTracked ? firstTracked : first;
    const end = last > today ? today : last;
    if (start > end) return { pct: null, done: 0 };
    let tracked = 0;
    let done = 0;
    for (let d = start; d <= end; d = addDaysToDate(d, 1)) {
      tracked++;
      if (doneDates.has(d)) done++;
    }
    return { pct: tracked === 0 ? null : pct(done, tracked), done };
  });
}

function Ico({ children }: { children: ReactNode }) {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {children}
    </svg>
  );
}
const DonutIcon = () => (
  <Ico>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5A5.5 5.5 0 0 1 13.5 8" strokeWidth="2.4" />
  </Ico>
);
const FlameIcon = () => (
  <Ico>
    <path d="M8 1.8c2.4 2.6 3.8 4.6 3.8 6.6a3.8 3.8 0 0 1-7.6 0c0-1 .5-2 1.4-3 .2 1 .8 1.6 1.6 1.8-.5-2 .1-4 1.4-5.4Z" />
  </Ico>
);
const TrophyIcon = () => (
  <Ico>
    <path d="M4.5 2.5h7v3a3.5 3.5 0 0 1-7 0Z" />
    <path d="M4.5 3.5H2.7c0 1.6.8 2.6 2 2.8M11.5 3.5h1.8c0 1.6-.8 2.6-2 2.8M6 13.5h4M8 9v4.5" />
  </Ico>
);
const CheckIcon = () => (
  <Ico>
    <path d="M3 8.5 6.5 12 13 4.5" strokeWidth="1.8" />
  </Ico>
);

function Stat({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs tabular-nums" title={label} style={{ color: "var(--text-muted)" }}>
      {icon}
      <strong style={{ color: "var(--text-primary)" }}>{children}</strong>
    </span>
  );
}

/**
 * The Trends adherence view shared by Habits and Supplements: an A–Z grid
 * of coloured cards, each a month calendar (or, in Year view, a 12-month
 * consistency bar) for one item, with a Month/Year toggle, a period
 * stepper and a category filter. Rename/archive actions are wired when the
 * caller passes handlers.
 */
export function AdherenceCardGrid({
  stats,
  events,
  accent,
  noun,
  busyIdentity = null,
  onArchiveToggle,
  onRename,
}: {
  /** Every item, active and archived — split internally. */
  stats: ItemStats[];
  events: CanonicalEvent[];
  /** Domain accent — toggle/chips colour and the fallback card hue. */
  accent: string;
  /** "habit" / "supplement" — used in the empty-category line. */
  noun: string;
  busyIdentity?: string | null;
  onArchiveToggle?: (item: ItemStats) => void;
  onRename?: (item: ItemStats, name: string) => void;
}) {
  const today = useMemo(() => todayLocalISODate(), []);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => monthStart(todayLocalISODate()));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const active = useMemo(() => stats.filter((s) => !s.isArchived), [stats]);
  const archived = useMemo(() => stats.filter((s) => s.isArchived), [stats]);
  const span = useMemo(() => getDatasetSpan(events), [events]);
  const categories = useMemo(() => Array.from(new Set(active.map((s) => s.category))).sort(), [active]);

  const rows = useMemo(() => {
    const list = categoryFilter === "all" ? active : active.filter((s) => s.category === categoryFilter);
    return [...list].sort((a, b) => a.item.localeCompare(b.item));
  }, [active, categoryFilter]);

  // Colour keyed off the full A–Z list so an item keeps its hue when the
  // category filter changes.
  const colorByItem = useMemo(() => {
    const m = new Map<string, string>();
    [...active].sort((a, b) => a.item.localeCompare(b.item)).forEach((s, i) => m.set(s.item, PALETTE[i % PALETTE.length]));
    return m;
  }, [active]);

  const doneByItem = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of active) m.set(s.item, new Set(buildStateByDate(events, s.item).keys()));
    return m;
  }, [events, active]);

  if (active.length === 0 && archived.length === 0) return null;

  const anchorYear = Number(anchor.slice(0, 4));
  const shift = (n: number) => {
    const d = new Date(`${anchor}T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };
  const canPrev = span ? anchor > monthStart(span.start) : false;
  const canNext = view === "month" ? anchor < monthStart(today) : anchorYear < Number(today.slice(0, 4));

  return (
    <div className="flex flex-col gap-4">
      {active.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ViewToggle value={view} onChange={setView} />
            <PeriodNav view={view} anchor={anchor} today={today} setAnchor={setAnchor} onShift={shift} canPrev={canPrev} canNext={canNext} />
          </div>

          {categories.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {["all", ...categories].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  aria-pressed={categoryFilter === c}
                  className="rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors"
                  style={{
                    borderColor: categoryFilter === c ? accent : "var(--border-hairline)",
                    background: categoryFilter === c ? `color-mix(in oklab, ${accent} 12%, var(--surface-1))` : "transparent",
                    color: categoryFilter === c ? accent : "var(--text-muted)",
                  }}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No {noun}s in this category.
            </p>
          ) : (
            <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(156px, 1fr))" }}>
              {rows.map((it) => {
                const done = doneByItem.get(it.item) ?? new Set<string>();
                const color = colorByItem.get(it.item) ?? accent;
                const longest = view === "year" ? computeLongestStreak(listDatesBetween(it.firstTrackedDate, today), done) : 0;
                return (
                  <div
                    key={it.itemIdentity}
                    className="flex flex-col gap-2 rounded-lg border p-2.5"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
                  >
                    {onArchiveToggle && onRename ? (
                      <ItemActions
                        item={it}
                        busy={busyIdentity === it.itemIdentity}
                        onArchiveToggle={() => onArchiveToggle(it)}
                        onRename={(newName) => onRename(it, newName)}
                        iconArchive
                      />
                    ) : (
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {it.item}
                      </span>
                    )}

                    {view === "month" ? (
                      <div className="flex flex-col gap-1 self-center">
                        <HabitGridWeekdays />
                        <HabitMonthGrid monthAnchor={anchor} completedDates={done} firstTrackedDate={it.firstTrackedDate} today={today} color={color} />
                      </div>
                    ) : (
                      <HabitYearBars monthly={monthlyConsistency(anchorYear, done, it.firstTrackedDate, today)} color={color} />
                    )}

                    <div
                      className="flex items-center gap-2.5 overflow-hidden border-t pt-2 whitespace-nowrap"
                      style={{ borderColor: "var(--gridline)" }}
                    >
                      <Stat icon={<DonutIcon />} label="Consistency">
                        {it.consistencyPct}%
                      </Stat>
                      <Stat icon={<CheckIcon />} label="Days completed">
                        {it.daysCompleted}
                      </Stat>
                      {view === "month" ? (
                        <Stat icon={<FlameIcon />} label="Current streak">
                          {it.currentStreak}
                        </Stat>
                      ) : (
                        <Stat icon={<TrophyIcon />} label="Longest streak">
                          {longest}
                        </Stat>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {archived.length > 0 && (
        <Card tier="raw">
          <Disclosure label="Archived" count={archived.length}>
            <ul className="mt-3 flex flex-col gap-2">
              {archived.map((it) => (
                <li
                  key={it.itemIdentity}
                  className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
                  style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
                >
                  {it.item}
                  {onArchiveToggle && (
                    <button
                      type="button"
                      onClick={() => onArchiveToggle(it)}
                      disabled={busyIdentity === it.itemIdentity}
                      className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Unarchive
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
      )}
    </div>
  );
}
