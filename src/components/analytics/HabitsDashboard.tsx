"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useData } from "@/lib/DataContext";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { ItemActions } from "@/components/ui/ItemActions";
import { HabitGridWeekdays, HabitMonthGrid, HabitYearBars } from "@/components/charts/HabitMonthGrid";
import { useItemActions } from "@/lib/useItemActions";
import {
  addDaysToDate,
  computeLongestStreak,
  formatMonthYear,
  getDatasetSpan,
  listDatesBetween,
  monthStart,
  pct,
  todayLocalISODate,
} from "@/lib/aggregations/common";
import { buildStateByDate } from "@/lib/aggregations/adherence";
import { habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const ACCENT = TYPE_ACCENT.habit;

// A spread of palette hues so each habit reads as its own thing at a
// glance — adjacent entries sit in different colour families.
const HABIT_PALETTE = [
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

function Segmented({ value, onChange }: { value: View; onChange: (v: View) => void }) {
  return (
    <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border-hairline)" }}>
      {(["month", "year"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors"
          style={{
            background: value === v ? `color-mix(in oklab, ${ACCENT} 14%, var(--surface-1))` : "transparent",
            color: value === v ? ACCENT : "var(--text-muted)",
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function StepIcon({ dir }: { dir: "prev" | "next" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === "prev" ? "M7.5 2.5 4 6l3.5 3.5" : "M4.5 2.5 8 6l-3.5 3.5"} />
    </svg>
  );
}

function Stepper({ label, onPrev, onNext, canPrev, canNext }: { label: string; onPrev: () => void; onNext: () => void; canPrev: boolean; canNext: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous"
        className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-30"
        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
      >
        <StepIcon dir="prev" />
      </button>
      <span className="min-w-28 text-center text-xs font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next"
        className="flex h-7 w-7 items-center justify-center rounded-md border transition-colors disabled:opacity-30"
        style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
      >
        <StepIcon dir="next" />
      </button>
    </div>
  );
}

/** Per calendar month of `year`: the consistency %, and how many days the
 * habit was completed. `pct` is null for a month with no tracked days. */
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
    <span className="inline-flex items-center gap-1" title={label}>
      <span style={{ color: "var(--text-muted)" }}>{icon}</span>
      <strong style={{ color: "var(--text-primary)" }}>{children}</strong>
    </span>
  );
}

export function HabitsDashboard() {
  const { status, events, refresh } = useData();
  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);
  const today = useMemo(() => todayLocalISODate(), []);

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => monthStart(todayLocalISODate()));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const stats = useMemo(() => habitStats(events), [events]);

  const active = useMemo(() => stats.filter((s) => !s.isArchived), [stats]);
  const archived = useMemo(() => stats.filter((s) => s.isArchived), [stats]);
  const span = useMemo(() => getDatasetSpan(events), [events]);

  const categories = useMemo(() => Array.from(new Set(active.map((s) => s.category))).sort(), [active]);

  const habits = useMemo(() => {
    const list = categoryFilter === "all" ? active : active.filter((s) => s.category === categoryFilter);
    return [...list].sort((a, b) => a.item.localeCompare(b.item));
  }, [active, categoryFilter]);

  // Colour keyed off the full A–Z habit list, so a habit keeps its colour
  // when the category filter changes.
  const colorByHabit = useMemo(() => {
    const m = new Map<string, string>();
    [...active]
      .sort((a, b) => a.item.localeCompare(b.item))
      .forEach((s, i) => m.set(s.item, HABIT_PALETTE[i % HABIT_PALETTE.length]));
    return m;
  }, [active]);

  const doneByHabit = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const s of active) m.set(s.item, new Set(buildStateByDate(events, s.item).keys()));
    return m;
  }, [events, active]);

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  const anchorYear = Number(anchor.slice(0, 4));
  const stepMonths = view === "month" ? 1 : 12;
  const stepLabel = view === "month" ? formatMonthYear(anchor) : String(anchorYear);
  const shift = (n: number) => {
    const d = new Date(`${anchor}T00:00:00`);
    d.setMonth(d.getMonth() + n);
    setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };
  const canPrev = span ? anchor > monthStart(span.start) : false;
  const canNext = view === "month" ? anchor < monthStart(today) : anchorYear < Number(today.slice(0, 4));

  return (
    <div className="flex flex-col gap-5">
      <DashboardHeader>Habits</DashboardHeader>

      {active.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented value={view} onChange={setView} />
            <Stepper label={stepLabel} onPrev={() => shift(-stepMonths)} onNext={() => shift(stepMonths)} canPrev={canPrev} canNext={canNext} />
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
                    borderColor: categoryFilter === c ? ACCENT : "var(--border-hairline)",
                    background: categoryFilter === c ? `color-mix(in oklab, ${ACCENT} 12%, var(--surface-1))` : "transparent",
                    color: categoryFilter === c ? ACCENT : "var(--text-muted)",
                  }}
                >
                  {c === "all" ? "All" : c}
                </button>
              ))}
            </div>
          )}

          {habits.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              No habits in this category.
            </p>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(196px, 1fr))" }}>
              {habits.map((h) => {
                const done = doneByHabit.get(h.item) ?? new Set<string>();
                const color = colorByHabit.get(h.item) ?? ACCENT;
                const longest =
                  view === "year" ? computeLongestStreak(listDatesBetween(h.firstTrackedDate, today), done) : 0;
                return (
                  <div
                    key={h.itemIdentity}
                    className="flex flex-col gap-2.5 rounded-lg border p-3"
                    style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <ItemActions
                          item={h}
                          busy={busyIdentity === h.itemIdentity}
                          onArchiveToggle={() => void toggleArchive(h)}
                          onRename={(newName) => void rename(h, newName)}
                        />
                        <div
                          className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          <Stat icon={<DonutIcon />} label="Consistency">
                            {h.consistencyPct}%
                          </Stat>
                          <Stat icon={<FlameIcon />} label="Current streak">
                            {h.currentStreak}
                          </Stat>
                          {view === "year" && (
                            <>
                              <Stat icon={<TrophyIcon />} label="Longest streak">
                                {longest}
                              </Stat>
                              <Stat icon={<CheckIcon />} label="Days completed">
                                {h.daysCompleted}
                              </Stat>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {view === "month" ? (
                      <div className="flex flex-col gap-1">
                        <HabitGridWeekdays />
                        <HabitMonthGrid monthAnchor={anchor} completedDates={done} firstTrackedDate={h.firstTrackedDate} today={today} color={color} />
                      </div>
                    ) : (
                      <HabitYearBars monthly={monthlyConsistency(anchorYear, done, h.firstTrackedDate, today)} color={color} />
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
              {archived.map((item) => (
                <li
                  key={item.itemIdentity}
                  className="flex items-center justify-between gap-2 border-t pt-2 text-sm"
                  style={{ borderColor: "var(--gridline)", color: "var(--text-secondary)" }}
                >
                  {item.item}
                  <button
                    type="button"
                    onClick={() => void toggleArchive(item)}
                    disabled={busyIdentity === item.itemIdentity}
                    className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Unarchive
                  </button>
                </li>
              ))}
            </ul>
          </Disclosure>
        </Card>
      )}

      <Methodology>
        A day counts as tracked once the habit has been logged at least once, through to today; gaps count as
        misses, days before the first log don&apos;t. Consistency is completed days over tracked days; the streak
        is consecutive tracked days completed. Archiving only hides a habit from new logging — its history stays
        in every view here.
      </Methodology>
    </div>
  );
}
