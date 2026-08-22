import type { CanonicalEvent, RawWorkoutLog } from "@/lib/types";
import { addDaysToDate } from "./common";

export interface DayStoryEntry {
  key: string;
  time: string; // local HH:MM, for display
  sortKey: string; // ISO instant, for chronological ordering
  kind: "meal" | "exercise" | "symptom";
  label: string;
  description: string;
}

export interface DayStory {
  /** Meals/exercise/symptoms, merged and sorted chronologically — the
   * "story" itself. */
  entries: DayStoryEntry[];
  /** Supplements and habits logged today — routine compliance, not story
   * beats, so they're a compact trailing summary rather than their own
   * timeline dots (a good day of habit-tapping could otherwise add a
   * dozen near-identical rows and bury the actual story). */
  alsoLogged: string[];
  /** Hours between yesterday's last food entry and today's first one —
   * only set when BOTH exist, so this is read off two real timestamps,
   * never estimated or assumed. */
  fastingHours: number | null;
}

function localTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "eggs, toast & avocado" — natural join, not a comma-separated dump. */
function naturalJoin(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" & ");
  return `${items.slice(0, -1).join(", ")} & ${items.at(-1)}`;
}

/**
 * Turns today's raw logs into a compact, human-readable "day at a glance" —
 * read-only summary data, no editing affordances live here (that's the Log
 * page's job). Built from the same `CanonicalEvent`/`RawWorkoutLog` shapes
 * every other dashboard already reads, not a parallel data path.
 */
export function buildDayStory(events: CanonicalEvent[], workoutLogs: RawWorkoutLog[], date: string): DayStory {
  const todayEvents = events.filter((e) => e.date === date && e.completed);
  const entries: DayStoryEntry[] = [];

  // Meals — grouped by tag (Breakfast/Lunch/.../untagged), one entry per
  // tag actually used today, positioned at that group's earliest tap.
  const foodByMeal = new Map<string, CanonicalEvent[]>();
  for (const e of todayEvents) {
    if (e.itemType !== "food") continue;
    const tag = e.mealTag ?? "Other";
    const list = foodByMeal.get(tag) ?? [];
    list.push(e);
    foodByMeal.set(tag, list);
  }
  for (const [tag, group] of foodByMeal) {
    const sorted = [...group].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? ""));
    const first = sorted[0];
    if (!first.updatedAt) continue;
    entries.push({
      key: `meal:${tag}`,
      time: localTime(first.updatedAt),
      sortKey: first.updatedAt,
      kind: "meal",
      label: tag,
      description: naturalJoin(sorted.map((e) => e.item)),
    });
  }

  // Exercise — one entry per lift/session, not grouped, so a 3-exercise
  // gym day still reads as 3 distinct moments rather than one merged blob.
  // `RawWorkoutLog` doesn't carry its own configured unit (that lives on
  // the workout_items row, which this summary doesn't otherwise need) —
  // same simplification the Workout dashboard's own charts already make.
  for (const w of workoutLogs) {
    if (w.date !== date) continue;
    entries.push({
      key: `exercise:${w.id}`,
      time: localTime(new Date(w.updatedAt).toISOString()),
      sortKey: new Date(w.updatedAt).toISOString(),
      kind: "exercise",
      label: "Exercise",
      description: `${w.exercise} — ${w.weightKg} kg`,
    });
  }

  // Symptoms — genuinely story-worthy (something notable happened), unlike
  // routine supplement/habit taps below.
  for (const e of todayEvents) {
    if (e.itemType !== "outcome" || !e.updatedAt) continue;
    entries.push({
      key: `symptom:${e.id}`,
      time: localTime(e.updatedAt),
      sortKey: e.updatedAt,
      kind: "symptom",
      label: "Symptom",
      description: e.item,
    });
  }

  entries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Supplements/habits — a name, not a timeline moment; alphabetical since
  // there's no meaningful "story order" to a checklist.
  const alsoLogged = Array.from(
    new Set(todayEvents.filter((e) => e.itemType === "supplement" || e.itemType === "habit").map((e) => e.item)),
  ).sort((a, b) => a.localeCompare(b));

  // Fasting window: only when both an eating-window end (yesterday) and
  // start (today) are on record — never a guess.
  const yesterday = addDaysToDate(date, -1);
  const yesterdayFood = events.filter((e) => e.date === yesterday && e.itemType === "food" && e.completed && e.updatedAt);
  const todayFood = todayEvents.filter((e) => e.itemType === "food" && e.updatedAt);
  let fastingHours: number | null = null;
  if (yesterdayFood.length > 0 && todayFood.length > 0) {
    const lastNight = yesterdayFood.reduce((latest, e) => ((e.updatedAt as string) > latest ? (e.updatedAt as string) : latest), yesterdayFood[0].updatedAt as string);
    const firstToday = todayFood.reduce((earliest, e) => ((e.updatedAt as string) < earliest ? (e.updatedAt as string) : earliest), todayFood[0].updatedAt as string);
    const hours = (new Date(firstToday).getTime() - new Date(lastNight).getTime()) / 3_600_000;
    // A meaningful overnight fast, not "you ate a snack 40 minutes ago" —
    // below this it's not a fact worth surfacing.
    if (hours >= 6) fastingHours = Math.round(hours * 10) / 10;
  }

  return { entries, alsoLogged, fastingHours };
}
