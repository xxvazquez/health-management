"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/Card";
import { buildDayStory } from "@/lib/aggregations/myDay";
import { groupIntoPeriodRuns, currentCycleStatus } from "@/lib/aggregations/cycle";
import { addDaysToDate } from "@/lib/aggregations/common";
import { buildSnapshotEntries, DayTimeline, type DayNoteSummary } from "./daySnapshot";
import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog } from "@/lib/types";

export type { DayNoteSummary };

function formatFullDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

/** "3 meals, 1 workout, on your period" — a compact recap, not a second
 * full timeline, so Yesterday reads as a glance-back rather than
 * duplicating Today's own detail one day later. */
function recapPhrase(counts: { label: string; count: number }[]): string {
  const parts = counts.filter((c) => c.count > 0).map((c) => (c.count === 1 ? `1 ${c.label}` : `${c.count} ${c.label}s`));
  if (parts.length === 0) return "Nothing logged.";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Overview's first, most prominent section — what happened today (a full
 * chronological story, built by `buildSnapshotEntries`) plus a compact
 * one-line recap of yesterday, so "what's going on right now" never
 * requires a second glance at the Log page.
 */
export function TodaySnapshot({
  events,
  workoutLogs,
  periodLogs,
  todayNotes,
  yesterdayNotes,
  today,
}: {
  events: CanonicalEvent[];
  workoutLogs: RawWorkoutLog[];
  periodLogs: RawPeriodLog[];
  todayNotes: DayNoteSummary[];
  yesterdayNotes: DayNoteSummary[];
  today: string;
}) {
  const yesterday = addDaysToDate(today, -1);

  const todayEntries = useMemo(
    () => buildSnapshotEntries(events, workoutLogs, periodLogs, todayNotes, today),
    [events, workoutLogs, periodLogs, todayNotes, today],
  );
  const todayStory = useMemo(() => buildDayStory(events, workoutLogs, today), [events, workoutLogs, today]);
  const yesterdayStory = useMemo(() => buildDayStory(events, workoutLogs, yesterday), [events, workoutLogs, yesterday]);
  const yesterdayCycle = useMemo(
    () => currentCycleStatus(groupIntoPeriodRuns(periodLogs), yesterday),
    [periodLogs, yesterday],
  );

  const hasToday = todayEntries.length > 0 || todayStory.alsoLogged.length > 0;

  const yesterdayRecap = recapPhrase([
    { label: "meal", count: yesterdayStory.entries.filter((e) => e.kind === "meal").length },
    { label: "workout entry", count: yesterdayStory.entries.filter((e) => e.kind === "exercise").length },
    { label: "symptom", count: yesterdayStory.entries.filter((e) => e.kind === "symptom").length },
    { label: "note", count: yesterdayNotes.length },
  ]);

  return (
    <Card tier="primary">
      <CardTitle subtitle={formatFullDate(today)}>Today</CardTitle>

      {!hasToday ? (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing logged yet today —{" "}
          <Link href="/log" className="underline decoration-dotted">
            log something
          </Link>{" "}
          to see it here.
        </p>
      ) : (
        <>
          <DayTimeline entries={todayEntries} />
          {todayStory.alsoLogged.length > 0 && (
            <p className="mt-2.5 text-xs" style={{ color: "var(--text-secondary)" }}>
              Also logged: {todayStory.alsoLogged.join(", ")}
            </p>
          )}
          {todayStory.fastingHours !== null && (
            <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              {todayStory.fastingHours}h fasting window
            </p>
          )}
        </>
      )}

      <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-secondary)" }}>
          Yesterday{yesterdayCycle.onPeriod ? " · on your period" : ""}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          {yesterdayRecap}
        </p>
      </div>
    </Card>
  );
}
