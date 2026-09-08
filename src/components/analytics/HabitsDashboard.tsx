"use client";

import { useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { Disclosure } from "@/components/ui/Disclosure";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Methodology } from "@/components/ui/Methodology";
import { StatTile } from "@/components/ui/StatTile";
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
import { habitsAtAGlance, habitStats } from "@/lib/aggregations/habits";
import { TYPE_ACCENT } from "@/taxonomy/categories";

const ACCENT = TYPE_ACCENT.habit;

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

/** Consistency for each calendar month of `year`, using the same
 * every-tracked-day model as the strip: a day counts once the habit has
 * been logged at least once, and up to today. */
function monthlyConsistency(year: number, doneDates: Set<string>, firstTracked: string, today: string): { pct: number | null }[] {
  return Array.from({ length: 12 }, (_, m) => {
    const prefix = `${year}-${String(m + 1).padStart(2, "0")}`;
    const first = `${prefix}-01`;
    const last = `${prefix}-${String(new Date(year, m + 1, 0).getDate()).padStart(2, "0")}`;
    const start = first < firstTracked ? firstTracked : first;
    const end = last > today ? today : last;
    if (start > end) return { pct: null };
    let tracked = 0;
    let done = 0;
    for (let d = start; d <= end; d = addDaysToDate(d, 1)) {
      tracked++;
      if (doneDates.has(d)) done++;
    }
    return { pct: tracked === 0 ? null : pct(done, tracked) };
  });
}

export function HabitsDashboard() {
  const { status, events, refresh, categoryColor } = useData();
  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);
  const today = useMemo(() => todayLocalISODate(), []);
  const colorFor = (category: string) => categoryColor("habit", category) ?? ACCENT;

  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(() => monthStart(todayLocalISODate()));
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const glance = useMemo(() => habitsAtAGlance(events), [events]);
  const stats = useMemo(() => habitStats(events), [events]);

  const active = useMemo(() => stats.filter((s) => !s.isArchived), [stats]);
  const archived = useMemo(() => stats.filter((s) => s.isArchived), [stats]);
  const span = useMemo(() => getDatasetSpan(events), [events]);

  const categories = useMemo(() => Array.from(new Set(active.map((s) => s.category))).sort(), [active]);

  const habits = useMemo(() => {
    const list = categoryFilter === "all" ? active : active.filter((s) => s.category === categoryFilter);
    return [...list].sort((a, b) => a.item.localeCompare(b.item));
  }, [active, categoryFilter]);

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

      {glance.trackedCount > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label="Average consistency"
            value={glance.avgConsistencyPct !== null ? `${Math.round(glance.avgConsistencyPct)}%` : "—"}
            detail={`across ${glance.trackedCount} tracked`}
            accent={ACCENT}
          />
          <StatTile label="Tracked" value={String(glance.trackedCount)} detail={glance.trackedCount === 1 ? "habit" : "habits"} />
        </div>
      )}

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

          <Card tier="raw">
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
              {habits.map((h) => {
                const done = doneByHabit.get(h.item) ?? new Set<string>();
                const color = colorFor(h.category);
                const longest =
                  view === "year" ? computeLongestStreak(listDatesBetween(h.firstTrackedDate, today), done) : 0;
                return (
                  <div key={h.itemIdentity} className="flex flex-col gap-2.5 py-3.5 first:pt-0 last:pb-0 lg:flex-row lg:items-start lg:gap-8">
                    <div className="min-w-0 lg:w-60 lg:shrink-0">
                      <ItemActions
                        item={h}
                        busy={busyIdentity === h.itemIdentity}
                        onArchiveToggle={() => void toggleArchive(h)}
                        onRename={(newName) => void rename(h, newName)}
                      />
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                        <span>
                          <strong style={{ color: "var(--text-primary)" }}>{h.consistencyPct}%</strong> consistency
                        </span>
                        <span>
                          <strong style={{ color: "var(--text-primary)" }}>{h.currentStreak}</strong>-day streak
                        </span>
                        {view === "year" && (
                          <>
                            <span>
                              <strong style={{ color: "var(--text-primary)" }}>{longest}</strong> best
                            </span>
                            <span>
                              <strong style={{ color: "var(--text-primary)" }}>{h.daysCompleted}</strong> days done
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {view === "month" ? (
                        <div className="flex flex-col gap-1">
                          <HabitGridWeekdays />
                          <HabitMonthGrid monthAnchor={anchor} completedDates={done} firstTrackedDate={h.firstTrackedDate} today={today} color={color} />
                        </div>
                      ) : (
                        <div className="w-56">
                          <HabitYearBars monthly={monthlyConsistency(anchorYear, done, h.firstTrackedDate, today)} color={color} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {habits.length === 0 && (
                <p className="py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                  No habits in this category.
                </p>
              )}
            </div>
          </Card>
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
        misses, days before the first log don&apos;t. Consistency is completed days over tracked days. &quot;What
        stands out&quot; compares the last 14 tracked days with the habit&apos;s own longer-run pace and needs at
        least 10 overall and 5 recent tracked days before it says anything. Archiving only hides a habit from new
        logging — its history stays in every view here.
      </Methodology>
    </div>
  );
}
