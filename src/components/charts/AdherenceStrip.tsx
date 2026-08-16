"use client";

import { listDatesBetween } from "@/lib/aggregations/common";
import type { DayState } from "./CalendarHeatmap";

// Deliberately 3 distinct intensities, not 2 competing hues: a tracked day
// that happened is the strongest signal, a tracked-but-missed day is
// visible but quieter, and a not-tracked day recedes into the background —
// so the eye reads "what happened" before "what's missing".
const STATE_COLOR: Record<DayState, string> = {
  completed: "var(--series-1)",
  "tracked-not-completed": "color-mix(in oklab, var(--series-4) 55%, var(--page-plane))",
  "not-tracked": "var(--gridline)",
};

/** One horizontal strip of day-cells — used as a matrix row (label + strip) for adherence views. */
export function AdherenceStrip({
  startDate,
  endDate,
  stateByDate,
}: {
  startDate: string;
  endDate: string;
  stateByDate: Map<string, DayState>;
}) {
  const dates = listDatesBetween(startDate, endDate);
  return (
    <div className="flex gap-[2px] overflow-hidden">
      {dates.map((date) => {
        const state = stateByDate.get(date) ?? "not-tracked";
        return (
          <div
            key={date}
            title={`${date}: ${state === "completed" ? "completed" : state === "tracked-not-completed" ? "tracked, not completed" : "not tracked"}`}
            className="h-3.5 w-[5px] shrink-0 rounded-[1px]"
            style={{ background: STATE_COLOR[state] }}
          />
        );
      })}
    </div>
  );
}
