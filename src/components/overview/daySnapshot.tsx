import { buildDayStory, type DayStoryEntry } from "@/lib/aggregations/myDay";
import { groupIntoPeriodRuns, currentCycleStatus } from "@/lib/aggregations/cycle";
import { DOMAIN_ACCENT } from "./domainStyle";
import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog, WorkoutUnit } from "@/lib/types";
import type { ActivityDomain } from "@/lib/aggregations/activity";

/** A note reduced to just what a day's timeline needs to show it inline
 * alongside meals/exercise/symptoms — built by the Overview page from
 * whatever note threads it already fetched, so nothing in this module (or
 * myDay.ts underneath it) has to know Notes lives in Supabase, not the
 * offline cache. */
export interface DayNoteSummary {
  key: string;
  time: string;
  sortKey: string;
  label: string;
  description: string;
}

export interface SnapshotEntry {
  key: string;
  time: string;
  sortKey: string;
  domain: ActivityDomain;
  label: string;
  description: string;
}

const KIND_TO_DOMAIN: Record<DayStoryEntry["kind"], ActivityDomain> = { meal: "food", exercise: "workout", symptom: "symptom" };

/**
 * One day's full cross-domain story — reuses `buildDayStory`'s meal/
 * exercise/symptom narrative for a single date (today, yesterday, or any
 * date clicked on the Calendar; `buildDayStory` was always generic over
 * `date`, this just layers Cycle + Notes on top of it consistently
 * wherever a single day needs to be shown). Shared by TodaySnapshot and the
 * Calendar's day-detail view rather than each reimplementing this merge.
 */
export function buildSnapshotEntries(
  events: CanonicalEvent[],
  workoutLogs: RawWorkoutLog[],
  periodLogs: RawPeriodLog[],
  notes: DayNoteSummary[],
  date: string,
  unitByExercise: Map<string, WorkoutUnit> = new Map(),
): SnapshotEntry[] {
  const story = buildDayStory(events, workoutLogs, date, unitByExercise);
  const cycle = currentCycleStatus(groupIntoPeriodRuns(periodLogs), date);

  const list: SnapshotEntry[] = story.entries.map((e) => ({
    key: e.key,
    time: e.time,
    sortKey: e.sortKey,
    domain: KIND_TO_DOMAIN[e.kind],
    label: e.label,
    description: e.description,
  }));
  if (cycle.onPeriod) {
    list.push({
      key: `cycle:${date}`,
      time: "",
      sortKey: `${date}T00:00:00.000Z`,
      domain: "cycle",
      label: "Period",
      description: `Day ${cycle.periodDay}`,
    });
  }
  for (const n of notes) list.push({ key: n.key, time: n.time, sortKey: n.sortKey, domain: "notes", label: n.label, description: n.description });
  return list.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/** The vertical dot-rail timeline shared by TodaySnapshot and the
 * Calendar's day-detail view — one row per entry, domain-colored dot,
 * connecting rail between them. */
export function DayTimeline({ entries }: { entries: SnapshotEntry[] }) {
  return (
    <div className="flex flex-col">
      {entries.map((e, i) => (
        <div key={e.key} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: DOMAIN_ACCENT[e.domain] }} />
            {i < entries.length - 1 && <span className="w-px flex-1" style={{ background: "var(--gridline)" }} />}
          </div>
          <div className={i < entries.length - 1 ? "min-w-0 flex-1 pb-2.5" : "min-w-0 flex-1"}>
            <p className="text-sm">
              <span className="font-semibold" style={{ color: DOMAIN_ACCENT[e.domain] }}>
                {e.label}
              </span>{" "}
              <span style={{ color: "var(--text-secondary)" }}>— {e.description}</span>
            </p>
            {e.time && (
              <p className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                {e.time}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
