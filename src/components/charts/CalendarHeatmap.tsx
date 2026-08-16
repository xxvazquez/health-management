"use client";

import { listDatesBetween } from "@/lib/aggregations/common";

export type DayState = "completed" | "tracked-not-completed" | "not-tracked";

// Same 3-tier intensity logic as AdherenceStrip: completed is the loudest
// signal, tracked-but-missed is visible but quieter, not-tracked recedes.
const STATE_COLOR: Record<DayState, string> = {
  completed: "var(--series-1)",
  "tracked-not-completed": "color-mix(in oklab, var(--series-4) 55%, var(--page-plane))",
  "not-tracked": "var(--gridline)",
};

/** GitHub-style contribution grid: weeks as columns, Mon–Sun as rows. */
export function CalendarHeatmap({
  startDate,
  endDate,
  stateByDate,
}: {
  startDate: string;
  endDate: string;
  stateByDate: Map<string, DayState>;
}) {
  const dates = listDatesBetween(startDate, endDate);
  if (dates.length === 0) return null;

  // Pad to start on Monday.
  const firstDow = (new Date(`${dates[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const padded: (string | null)[] = [...Array(firstDow).fill(null), ...dates];
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < padded.length; i += 7) {
    weeks.push(padded.slice(i, i + 7));
  }

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((date, di) => {
              const state = date ? (stateByDate.get(date) ?? "not-tracked") : null;
              return (
                <div
                  key={di}
                  title={date ? `${date}: ${state === "completed" ? "completed" : state === "tracked-not-completed" ? "tracked, not completed" : "not tracked"}` : undefined}
                  className="h-[11px] w-[11px] rounded-[2px]"
                  style={{ background: date ? STATE_COLOR[state as DayState] : "transparent" }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: STATE_COLOR.completed }} /> Completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: STATE_COLOR["tracked-not-completed"] }} /> Tracked, not
          completed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: STATE_COLOR["not-tracked"] }} /> Not tracked
        </span>
      </div>
    </div>
  );
}
