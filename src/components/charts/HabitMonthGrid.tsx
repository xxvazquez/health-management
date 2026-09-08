"use client";

import { addDaysToDate, listDatesBetween } from "@/lib/aggregations/common";

const CELL = 13;
const GAP = 3;
const TRACK = `repeat(7, ${CELL}px)`;

/** Monday-based weekday index (0 = Mon … 6 = Sun) for a YYYY-MM-DD date. */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00`).getDay() + 6) % 7;
}

/** The seven weekday initials, on the same 7-column track as a
 * `HabitMonthGrid` so they line up above it. */
export function HabitGridWeekdays() {
  return (
    <div className="grid" style={{ gridTemplateColumns: TRACK, gap: GAP }}>
      {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
        <span key={i} className="text-center text-[9px] font-medium" style={{ color: "var(--text-muted)" }}>
          {d}
        </span>
      ))}
    </div>
  );
}

/** One month of a habit's history as a small calendar grid — a solid
 * accent cell for every completed day, a faint one for every other day in
 * the month, fainter still for days outside the habit's tracked window. */
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
  const [y, m] = ym.split("-").map(Number);
  const lastOfMonth = new Date(y, m, 0);
  const lastISO = `${ym}-${String(lastOfMonth.getDate()).padStart(2, "0")}`;
  const gridEnd = addDaysToDate(lastISO, 6 - mondayIndex(lastISO));

  const days = listDatesBetween(gridStart, gridEnd);

  return (
    <div className="grid" style={{ gridTemplateColumns: TRACK, gap: GAP }}>
      {days.map((date) => {
        const inMonth = date.slice(0, 7) === ym;
        if (!inMonth) return <span key={date} style={{ width: CELL, height: CELL }} aria-hidden="true" />;
        const done = completedDates.has(date);
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
  );
}

const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const YEAR_BAR_AREA = 44;

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
    <div className="grid items-end" style={{ gridTemplateColumns: "repeat(12, 1fr)", gap: 3 }}>
      {monthly.map((mo, i) => (
        <div key={i} className="flex flex-col items-center">
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
