"use client";

import { MonthPicker } from "@/components/ui/DatePicker";
import { Segmented } from "@/components/ui/Segmented";
import { TabRail } from "@/components/ui/TabRail";
import { useMemo, useState, type ReactNode } from "react";
import { useToday } from "@/lib/useToday";
import { Card } from "@/components/ui/Card";
import { Disclosure } from "@/components/ui/Disclosure";
import { ChevronIcon } from "@/components/ui/icons";
import { HabitGridWeekdays, HabitMonthGrid, HabitYearBars } from "@/components/charts/HabitMonthGrid";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { formatMinutes, getDatasetSpan, listDatesBetween, monthStart, todayLocalISODate } from "@/lib/aggregations/common";
import type { ItemStats } from "@/lib/aggregations/itemStats";
import { isScheduledDay, scheduledAdherence, scheduledStreak, type ItemSchedule } from "@/lib/aggregations/schedule";
import type { CanonicalEvent } from "@/lib/types";
import { BAND_OPTIONS, INPUT_KIND, bandLabelForValue } from "@/taxonomy/inputKinds";

// A spread of palette hues so each row reads as its own thing at a glance —
// adjacent entries sit in different colour families. Softened toward the
// surface so a densely-filled calendar reads as a tint, not a slab.
const PALETTE = [
  "--series-2",
  "--series-4",
  "--series-1",
  "--series-8",
  "--series-6",
  "--series-magenta",
  "--series-indigo",
  "--series-berry",
  "--series-3",
  "--series-slate",
].map((h) => `color-mix(in oklab, var(${h}) 52%, var(--surface-1))`);

type View = "month" | "year";

/** Same raised stepper shape as the Log page's day nav. */
const NAV_GROUP = "control-surface flex h-9 items-center rounded-[10px]";

function ViewToggle({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      options={[
        ["month", "Month"],
        ["year", "Year"],
      ]}
    />
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
    <div className={NAV_GROUP}>
      <button
        type="button"
        onClick={() => onShift(-step)}
        disabled={!canPrev}
        aria-label="Previous"
        className="hit-slop flex h-9 w-10 items-center justify-center rounded-[10px] disabled:opacity-30"
        style={{ color: "var(--ui-accent)" }}
      >
        <ChevronIcon dir="left" size={15} />
      </button>
      {view === "month" ? (
        <MonthPicker
          value={anchor.slice(0, 7)}
          onChange={(v) => v && setAnchor(`${v}-01`)}
          max={monthStart(today).slice(0, 7)}
          title="Month"
          renderTrigger={(open) => (
            <button type="button" onClick={open} aria-label="Pick a month" className="flex h-9 min-w-[7.5rem] items-center justify-center rounded-lg px-1">
              <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                {label}
              </span>
            </button>
          )}
        />
      ) : (
        <span className="flex min-w-[7.5rem] items-center justify-center px-1 py-1 text-sm font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => onShift(step)}
        disabled={!canNext}
        aria-label="Next"
        className="hit-slop flex h-9 w-10 items-center justify-center rounded-[10px] disabled:opacity-30"
        style={{ color: "var(--ui-accent)" }}
      >
        <ChevronIcon dir="right" size={15} />
      </button>
    </div>
  );
}

/** Per calendar month of `year`: adherence against the schedule, and how
 * many days the item was completed. `pct` is null for a month with nothing
 * expected. */
function monthlyConsistency(
  year: number,
  doneDates: Set<string>,
  firstTracked: string,
  today: string,
  schedule: ItemSchedule | undefined,
): { pct: number | null; done: number }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
    const first = `${prefix}-01`;
    const last = `${prefix}-${String(new Date(year, m + 1, 0).getDate()).padStart(2, "0")}`;
    const start = first < firstTracked ? firstTracked : first;
    const end = last > today ? today : last;
    if (start > end) return { pct: null, done: 0 };
    return scheduledAdherence(listDatesBetween(start, end), doneDates, schedule, today);
  });
}

/** The footer figures for the period the card is showing — the month or
 * year on the calendar, from the item's first tracked day up to today —
 * so the numbers always describe the squares above them. */
function periodStats(
  view: View,
  anchor: string,
  done: Set<string>,
  firstTracked: string,
  today: string,
  schedule: ItemSchedule | undefined,
): { pct: number | null; days: number; streak: number | null; streakKind: "current" | "longest" } | null {
  const year = anchor.slice(0, 4);
  const periodStart = view === "month" ? anchor : `${year}-01-01`;
  const lastOfMonth = new Date(Number(year), Number(anchor.slice(5, 7)), 0).getDate();
  const periodEnd = view === "month" ? `${anchor.slice(0, 7)}-${String(lastOfMonth).padStart(2, "0")}` : `${year}-12-31`;
  const start = periodStart < firstTracked ? firstTracked : periodStart;
  const end = periodEnd > today ? today : periodEnd;
  if (start > end) return null;
  const dates = listDatesBetween(start, end);
  const { pct, done: days } = scheduledAdherence(dates, done, schedule, today);
  // In a month that includes today, the streak that matters is the one still
  // running; any other period shows its longest run instead.
  const streakKind = view === "month" && periodEnd >= today ? "current" : "longest";
  const streakDates = streakKind === "current" ? listDatesBetween(firstTracked, today) : dates;
  return { pct, days, streak: scheduledStreak(streakDates, done, schedule, streakKind, today), streakKind };
}

/** "Mar – May" (with the year when it isn't this year's). */
function courseLabel(first: string, last: string, today: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: "short", year: d.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });
  const a = fmt(first);
  const b = fmt(last);
  return a === b ? a : `${a} – ${b}`;
}

/** A measured habit's logged value (minutes) per day — the day's largest entry. */
function valuesByDate(events: CanonicalEvent[], item: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) {
    if (e.item !== item || !e.completed || e.value == null) continue;
    m.set(e.date, Math.max(m.get(e.date) ?? 0, e.value));
  }
  return m;
}

/** 0–1 for a value inside the item's band range (or the logged range when it has no bands). */
function shadeScale(item: string, values: Map<string, number>): (date: string) => number | null {
  const bands = BAND_OPTIONS[item];
  const all = bands ? bands.map((b) => b.value) : Array.from(values.values());
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  return (date) => {
    const v = values.get(date);
    if (v == null) return null;
    return hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 1;
  };
}

/** "7–8h" — the band logged most often in the period, or the median for an exact duration. */
function typicalValue(item: string, values: Map<string, number>, start: string, end: string): string | null {
  const inPeriod = Array.from(values).filter(([d]) => d >= start && d <= end).map(([, v]) => v);
  if (inPeriod.length === 0) return null;
  if (BAND_OPTIONS[item]) {
    const counts = new Map<string, number>();
    for (const v of inPeriod) {
      const label = bandLabelForValue(item, v)!;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  const sorted = [...inPeriod].sort((a, b) => a - b);
  return formatMinutes(sorted[Math.floor(sorted.length / 2)]);
}

/** The first and last day of the month or year on the card. */
function periodBounds(view: View, anchor: string): { start: string; end: string } {
  const year = anchor.slice(0, 4);
  if (view === "year") return { start: `${year}-01-01`, end: `${year}-12-31` };
  const last = new Date(Number(year), Number(anchor.slice(5, 7)), 0).getDate();
  return { start: anchor, end: `${anchor.slice(0, 7)}-${String(last).padStart(2, "0")}` };
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
const MoonIcon = () => (
  <Ico>
    <path d="M13 9.6A5.5 5.5 0 1 1 6.4 3a4.3 4.3 0 0 0 6.6 6.6Z" />
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
 * stepper and a category filter. Review-only — renaming and archiving live
 * on the Settings page, like every other Trends dashboard.
 */
export function AdherenceCardGrid({
  stats,
  events,
  accent,
  noun,
  schedules = {},
}: {
  /** Every item, active and archived — split internally. */
  stats: ItemStats[];
  /** Per item id, how often it's meant to happen; absent = every day. */
  schedules?: Record<string, ItemSchedule>;
  events: CanonicalEvent[];
  /** Domain accent — toggle/chips colour and the fallback card hue. */
  accent: string;
  /** "habit" / "supplement" — used in the empty-category line. */
  noun: string;
}) {
  const today = useToday();
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

  // Sleep and other measured habits: each day's value, to shade the calendar.
  const valuesByItem = useMemo(() => {
    const m = new Map<string, Map<string, number>>();
    for (const s of stats) if (INPUT_KIND[s.item]) m.set(s.item, valuesByDate(events, s.item));
    return m;
  }, [events, stats]);

  const doneByItem = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of stats) m.set(s.item, new Set(buildStateByDate(events, s.item).keys()));
    return m;
  }, [events, stats]);

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
            <TabRail
              ariaLabel="Filter by category"
              wrap={false}
              tall
              style={{ borderColor: "var(--border-hairline)" }}
              items={["all", ...categories].map((c) => ({ id: c, label: c === "all" ? "All" : c, accent }))}
              activeId={categoryFilter}
              onSelect={setCategoryFilter}
            />
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
                const schedule = schedules[it.itemIdentity];
                const period = periodStats(view, anchor, done, it.firstTrackedDate, today, schedule);
                const values = valuesByItem.get(it.item);
                const bounds = periodBounds(view, anchor);
                const typical = values ? typicalValue(it.item, values, bounds.start, bounds.end) : null;
                return (
                  <div
                    key={it.itemIdentity}
                    className="flex flex-col gap-2 rounded-xl border p-2.5"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
                  >
                    {/* The name wraps instead of being cut off; mt-auto on the
                        chart keeps the calendars level across a row. */}
                    <span className="text-sm leading-snug font-medium" style={{ color: "var(--text-primary)" }}>
                      {it.item}
                    </span>

                    {view === "month" ? (
                      <div className="mt-auto flex flex-col gap-1 self-center">
                        <HabitGridWeekdays />
                        <HabitMonthGrid
                          monthAnchor={anchor}
                          completedDates={done}
                          firstTrackedDate={it.firstTrackedDate}
                          today={today}
                          color={color}
                          isScheduled={(d) => isScheduledDay(schedule, d)}
                          shade={values ? shadeScale(it.item, values) : undefined}
                        />
                      </div>
                    ) : (
                      <HabitYearBars monthly={monthlyConsistency(anchorYear, done, it.firstTrackedDate, today, schedule)} color={color} />
                    )}

                    {values ? (
                      typical && (
                        <div className="flex items-center gap-1 border-t pt-2 whitespace-nowrap" style={{ borderColor: "var(--gridline)" }}>
                          <Stat icon={<MoonIcon />} label="Typical">
                            {typical}
                          </Stat>
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            typical
                          </span>
                        </div>
                      )
                    ) : period && (
                      <div
                        className="flex items-center gap-2.5 overflow-hidden border-t pt-2 whitespace-nowrap"
                        style={{ borderColor: "var(--gridline)" }}
                      >
                        <Stat icon={<DonutIcon />} label="Consistency">
                          {period.pct == null ? "—" : `${Math.round(period.pct)}%`}
                        </Stat>
                        <Stat icon={<CheckIcon />} label="Days completed">
                          {period.days}
                        </Stat>
                        {period.streak != null && period.streak >= 2 && (
                          <Stat icon={period.streakKind === "current" ? <FlameIcon /> : <TrophyIcon />} label={period.streakKind === "current" ? "Current streak" : "Longest streak"}>
                            {period.streak}
                          </Stat>
                        )}
                      </div>
                    )}
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
              {archived.map((it) => {
                const end = it.stoppedDate ?? it.lastTrackedDate;
                const course = scheduledAdherence(listDatesBetween(it.firstTrackedDate, end), doneByItem.get(it.item) ?? new Set(), schedules[it.itemIdentity], today);
                return (
                  <li
                    key={it.itemIdentity}
                    className="flex items-baseline justify-between gap-3 border-t pt-2 text-sm"
                    style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
                  >
                    <span className="min-w-0">{it.item}</span>
                    <span className="shrink-0 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {courseLabel(it.firstTrackedDate, end, today)}
                      {course.pct != null && ` · ${Math.round(course.pct)}%`}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Disclosure>
        </Card>
      )}
    </div>
  );
}
