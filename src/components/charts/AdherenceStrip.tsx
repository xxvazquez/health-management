"use client";

import { listDatesBetween } from "@/lib/aggregations/common";

export type DayState = "done" | "missed";

/** One horizontal strip of day-cells — a solid accent cell for every day
 * the item was logged, a faint cell for every day it wasn't. Binary on
 * purpose: "not logged" covers both a missed day and a day before the item
 * was ever tracked, so the eye reads the accent pattern and nothing else. */
export function AdherenceStrip({
  startDate,
  endDate,
  stateByDate,
  color = "var(--series-1)",
}: {
  startDate: string;
  endDate: string;
  stateByDate: Map<string, DayState>;
  color?: string;
}) {
  const dates = listDatesBetween(startDate, endDate);
  return (
    <div className="flex gap-[2px] overflow-hidden">
      {dates.map((date) => {
        const done = stateByDate.get(date) === "done";
        return (
          <div
            key={date}
            title={`${date}: ${done ? "logged" : "not logged"}`}
            className="h-4 w-[5px] shrink-0 rounded-[1px]"
            style={{ background: done ? color : "var(--gridline)" }}
          />
        );
      })}
    </div>
  );
}
