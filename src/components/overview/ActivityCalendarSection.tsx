"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle } from "@/components/ui/Card";
import { monthStart } from "@/lib/aggregations/common";
import { buildSnapshotEntries, DayTimeline, type DayNoteSummary } from "./daySnapshot";
import { DOMAIN_ACCENT, DOMAIN_LABEL, ALL_DOMAINS } from "./domainStyle";
import type { ActivityDomain } from "@/lib/aggregations/activity";
import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog } from "@/lib/types";

/** Monday-first, always 7-column weeks — same grid math as the Log page's
 * Cycle tab calendar (not exported from there, so reproduced rather than
 * reached into another page's internals for four lines of date math). */
function calendarGridDates(monthDate: string): string[] {
  const first = new Date(`${monthDate}T00:00:00`);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
}

function shiftMonth(monthDate: string, delta: number): string {
  const d = new Date(`${monthDate}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonthLabel(monthDate: string): string {
  return new Date(`${monthDate}T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatFullDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/**
 * Monthly calendar — every day gets a small dot per domain active that
 * day (Food/Workout/Symptoms/Cycle/Notes), not a single accent fill like
 * the Cycle tab's own period calendar, since several domains routinely
 * co-occur on one day. Clicking a day opens its full story below, reusing
 * the same `buildSnapshotEntries`/`DayTimeline` TodaySnapshot renders
 * Today with — a calendar day and "Today" are the same kind of view, just
 * for a different date.
 */
export function ActivityCalendarSection({
  events,
  workoutLogs,
  periodLogs,
  dateMap,
  notesByDate,
  today,
}: {
  events: CanonicalEvent[];
  workoutLogs: RawWorkoutLog[];
  periodLogs: RawPeriodLog[];
  dateMap: Map<string, Set<ActivityDomain>>;
  notesByDate: Map<string, DayNoteSummary[]>;
  today: string;
}) {
  const [month, setMonth] = useState(() => monthStart(today));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const grid = useMemo(() => calendarGridDates(month), [month]);

  const selectedEntries = useMemo(
    () => (selectedDate ? buildSnapshotEntries(events, workoutLogs, periodLogs, notesByDate.get(selectedDate) ?? [], selectedDate) : []),
    [selectedDate, events, workoutLogs, periodLogs, notesByDate],
  );

  return (
    <Card tier="supporting">
      <CardTitle subtitle="Which days have Food, Workout, Symptoms, Cycle, or Notes activity — tap a day to see it.">Calendar</CardTitle>

      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          ‹
        </button>
        <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {formatMonthLabel(month)}
        </p>
        <button
          type="button"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          aria-label="Next month"
          className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        {WEEKDAY_LABELS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {grid.map((d) => {
          const inMonth = d.slice(0, 7) === month.slice(0, 7);
          const domains = dateMap.get(d);
          const isToday = d === today;
          const isSelected = d === selectedDate;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setSelectedDate(d)}
              className="flex h-11 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: isSelected ? "var(--page-plane)" : "transparent",
                color: inMonth ? "var(--text-primary)" : "var(--text-muted)",
                border: isSelected ? "2px solid var(--series-1)" : isToday ? "1px solid var(--series-1)" : "1px solid transparent",
                opacity: inMonth ? 1 : 0.45,
              }}
            >
              {Number(d.slice(8, 10))}
              <span className="flex h-1 gap-0.5">
                {domains &&
                  ALL_DOMAINS.filter((dom) => domains.has(dom)).map((dom) => (
                    <span key={dom} className="h-1 w-1 rounded-full" style={{ background: DOMAIN_ACCENT[dom] }} />
                  ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-secondary)" }}>
        {ALL_DOMAINS.map((d) => (
          <span key={d} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: DOMAIN_ACCENT[d] }} />
            {DOMAIN_LABEL[d]}
          </span>
        ))}
      </div>

      {selectedDate && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {formatFullDate(selectedDate)}
            </p>
            <button type="button" onClick={() => setSelectedDate(null)} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
              Close
            </button>
          </div>
          {selectedEntries.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Nothing logged this day.
            </p>
          ) : (
            <DayTimeline entries={selectedEntries} />
          )}
        </div>
      )}
    </Card>
  );
}
