import type { CanonicalEvent, RawWorkoutLog, RawPeriodLog } from "@/lib/types";
import { groupIntoPeriodRuns } from "./cycle";

/** The five domains Overview's cross-domain surfaces (Recent Activity,
 * Calendar, Timeline) understand — Notes isn't built from `events` the way
 * the other four are (it lives in Supabase directly, not the offline
 * cache — see lib/supabase/notes.ts's own comment), so every function here
 * takes it separately, and the Overview page merges it in afterward. */
export type ActivityDomain = "food" | "workout" | "symptom" | "cycle" | "notes";

export interface ActivityEntry {
  key: string;
  date: string; // YYYY-MM-DD, local
  /** Local "3:41 PM" for display — empty for a domain with no real
   * time-of-day on record (Cycle), rather than a made-up time. */
  time: string;
  /** ISO instant (or a same-day placeholder for a time-less entry) —
   * chronological ordering only, never shown. */
  sortKey: string;
  domain: ActivityDomain;
  label: string;
  description: string;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "eggs, toast & avocado" — natural join, not a comma-separated dump.
 * Duplicated from myDay.ts deliberately (four words, not worth a shared
 * import) rather than exported from there — this module and myDay.ts stay
 * fully independent, see this file's own top comment. */
function naturalJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" & ");
  return `${items.slice(0, -1).join(", ")} & ${items.at(-1)}`;
}

/**
 * Every Food/Workout/Symptom/Cycle entry across all recorded history, as one
 * flat, uniformly-shaped, most-recent-first list — the shared basis for
 * Overview's Recent Activity feed, its Lauva Timeline, and its Calendar's
 * per-day dots. Distinct from `myDay.ts`'s `buildDayStory`: that one builds
 * a rich single-day narrative (grouped meals, a fasting window, routine
 * "also logged" items) for exactly one date; this one is a flat cross-date
 * feed with one shape per row, meant to be filtered/sliced/grouped by
 * whatever's calling it rather than read as prose.
 *
 * Food is grouped by (date, meal tag) the same way `buildDayStory` groups a
 * single day's meals, just repeated across every date instead of one.
 * Cycle contributes one entry per period *run* (at its start date), not one
 * per logged day — a 5-day period would otherwise flood the feed with five
 * near-identical "Period" rows; the Calendar wants a dot on every day of a
 * period, but reads `periodLogs` directly for that, not this feed.
 */
export function buildActivityFeed(events: CanonicalEvent[], workoutLogs: RawWorkoutLog[], periodLogs: RawPeriodLog[]): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  const foodByGroup = new Map<string, CanonicalEvent[]>();
  for (const e of events) {
    if (e.itemType !== "food" || !e.completed) continue;
    const key = `${e.date}|${e.mealTag ?? "Other"}`;
    const list = foodByGroup.get(key) ?? [];
    list.push(e);
    foodByGroup.set(key, list);
  }
  for (const [key, group] of foodByGroup) {
    const tag = key.slice(key.indexOf("|") + 1);
    const sorted = [...group].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
    const first = sorted[0];
    if (!first.updatedAt) continue;
    entries.push({
      key: `food:${key}`,
      date: first.date,
      time: localTime(first.updatedAt),
      sortKey: first.updatedAt,
      domain: "food",
      label: tag,
      description: naturalJoin(sorted.map((e) => e.item)),
    });
  }

  // Same "no per-exercise unit" simplification buildDayStory/the Workout
  // dashboard's own charts already make — a full unit lookup needs the
  // workout_items table this feed doesn't otherwise touch, for a detail
  // that's supporting color here, not the point.
  for (const w of workoutLogs) {
    const instant = new Date(w.updatedAt).toISOString();
    entries.push({
      key: `workout:${w.id}`,
      date: w.date,
      time: localTime(instant),
      sortKey: instant,
      domain: "workout",
      label: w.exercise,
      description: `${w.weightKg} kg`,
    });
  }

  for (const e of events) {
    if (e.itemType !== "outcome" || !e.completed || !e.updatedAt) continue;
    entries.push({
      key: `symptom:${e.id}`,
      date: e.date,
      time: localTime(e.updatedAt),
      sortKey: e.updatedAt,
      domain: "symptom",
      label: "Symptom",
      description: e.item,
    });
  }

  for (const run of groupIntoPeriodRuns(periodLogs)) {
    const days = run.days.length;
    entries.push({
      key: `cycle:${run.startDate}`,
      date: run.startDate,
      time: "",
      sortKey: `${run.startDate}T12:00:00.000Z`,
      domain: "cycle",
      label: "Period",
      description: days > 1 ? `Started — ${days} days logged` : "Logged",
    });
  }

  return entries.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
}

/** Which dates have at least one entry for each domain — the Calendar's
 * per-day dots. A period's every logged day counts (not just its start,
 * unlike `buildActivityFeed` above), since a day either was or wasn't part
 * of a period regardless of how the feed chooses to summarize the run. */
export function buildActivityDateMap(
  events: CanonicalEvent[],
  workoutLogs: RawWorkoutLog[],
  periodLogs: RawPeriodLog[],
): Map<string, Set<ActivityDomain>> {
  const map = new Map<string, Set<ActivityDomain>>();
  const mark = (date: string, domain: ActivityDomain) => {
    const set = map.get(date) ?? new Set<ActivityDomain>();
    set.add(domain);
    map.set(date, set);
  };
  for (const e of events) {
    if (!e.completed) continue;
    if (e.itemType === "food") mark(e.date, "food");
    else if (e.itemType === "outcome") mark(e.date, "symptom");
  }
  for (const w of workoutLogs) mark(w.date, "workout");
  for (const p of periodLogs) mark(p.date, "cycle");
  return map;
}
