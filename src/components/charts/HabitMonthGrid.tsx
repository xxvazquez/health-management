"use client";

import { addDaysToDate, listDatesBetween } from "@/lib/aggregations/common";

const CELL = 15;
const GAP = 3;

/** Monday-based weekday index (0 = Mon … 6 = Sun) for a YYYY-MM-DD date. */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}

export const HABIT_GRID_WIDTH = 7 * CELL + 6 * GAP;

/** The seven weekday initials, aligned to a `HabitMonthGrid`'s columns. */
export function HabitGridWeekdays() {
  return (
    <div className="flex" style={{ gap: GAP }}>
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <span
          key={i}
          className="text-center text-[9px] font-medium"
          style={{ width: CELL, color: "var(--text-muted)" }}
        >
          {d}
        </span>
      ))}
    </div>
  );
}

/** One month of a habit's history as a calendar grid — a solid accent cell
 * for every completed day, a faint cell for every other day in the month.
 * All grids for the same month share a column layout, so weekday patterns
 * line up when the rows are stacked. */
export function HabitMonthGrid({
  monthAnchor,
  completedDates,
  firstTrackedDate,
  today,
  color,
}: {
  /** Any YYYY-MM-DD inside the month to show. */
  monthAnchor: string;
  completedDates: Set<string>;
  firstTrackedDate: string;
  today: string;
  color: string;
}) {
  const ym = monthAnchor.slice(0, 7);
  const firstOfMonth = `${ym}-01`;
  const gridStart = addDaysToDate(firstOfMonth, -mondayIndex(firstOfMonth));
  // Last day of the month: day 0 of the next month.
  const [y, m] = ym.split("-").map(Number);
  const lastOfMonth = new Date(y, m, 0);
  const lastISO = `${ym}-${String(lastOfMonth.getDate()).padStart(2, "0")}`;
  const gridEnd = addDaysToDate(lastISO, 6 - mondayIndex(lastISO));

  const days = listDatesBetween(gridStart, gridEnd);
  const weeks: string[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="flex flex-col" style={{ gap: GAP }}>
      {weeks.map((week) => (
        <div key={week[0]} className="flex" style={{ gap: GAP }}>
          {week.map((date) => {
            const inMonth = date.slice(0, 7) === ym;
            if (!inMonth) return <span key={date} style={{ width: CELL, height: CELL }} aria-hidden="true" />;
            const done = completedDates.has(date);
            // A day the habit could actually have been logged: from its first
            // ever log up to today. Days outside that window still get a cell
            // (so the whole month shows) but a fainter one.
            const inPlay = date <= today && date >= firstTrackedDate;
            return (
              <span
                key={date}
                title={`${date}: ${done ? "logged" : date > today ? "upcoming" : "not logged"}`}
                style={{
                  width: CELL,
                  height: CELL,
                  borderRadius: 3,
                  background: done
                    ? color
                    : inPlay
                      ? "var(--gridline)"
                      : "color-mix(in oklab, var(--gridline) 38%, transparent)",
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const YEAR_BAR_AREA = 40;

/** Twelve bars, one per calendar month, height proportional to that
 * month's consistency — a compact read on year-scale seasonality. A month
 * with no tracked days has no bar at all (just its letter), so "nothing
 * logged" and "logged, but rarely" never look alike. */
export function HabitYearBars({
  monthly,
  color,
}: {
  /** Exactly 12 entries, Jan→Dec; `pct` null for a month with no tracked days. */
  monthly: { pct: number | null }[];
  color: string;
}) {
  return (
    <div className="flex items-end" style={{ gap: 4 }}>
      {monthly.map((mo, i) => (
        <div key={i} className="flex flex-1 flex-col items-center">
          <div className="flex w-full items-end justify-center" style={{ height: YEAR_BAR_AREA }}>
            {mo.pct != null && (
              <span
                className="w-full rounded-t-sm"
                style={{ height: Math.max(2, Math.round((mo.pct / 100) * YEAR_BAR_AREA)), background: color }}
                title={`${MONTH_LETTERS[i]}: ${Math.round(mo.pct)}%`}
              />
            )}
          </div>
          <span
            className="w-full border-t pt-0.5 text-center text-[9px] font-medium"
            style={{ color: "var(--text-muted)", borderColor: "var(--gridline)" }}
          >
            {MONTH_LETTERS[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
