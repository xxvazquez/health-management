import { computeCurrentStreak, computeLongestStreak, isoWeekStart, round1 } from "./common";

/** How often a supplement or habit is meant to happen. No schedule means
 * every day. `days` are Monday-based weekday indexes (0 = Mon … 6 = Sun). */
export type ItemSchedule = { kind: "weekly"; times: number } | { kind: "days"; days: number[] };

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday-based weekday index for a YYYY-MM-DD date. */
export function weekdayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** "Every day" / "3× a week" / "Mon, Thu". */
export function scheduleLabel(schedule: ItemSchedule | undefined): string {
  if (!schedule) return "Every day";
  if (schedule.kind === "weekly") return `${schedule.times}× a week`;
  if (schedule.days.length === 7) return "Every day";
  return [...schedule.days].sort().map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** True on a day the schedule expects the item (always, for a weekly count). */
export function isScheduledDay(schedule: ItemSchedule | undefined, date: string): boolean {
  return schedule?.kind !== "days" || schedule.days.includes(weekdayIndex(date));
}

export interface ScheduledAdherence {
  /** Share of what the schedule expected that was done; null when nothing was expected yet. */
  pct: number | null;
  /** Days logged in the window, on any day. */
  done: number;
}

/**
 * Adherence over `dates` (every calendar day of the window, ascending)
 * against the schedule. Every day: done days over days. Specific days:
 * done scheduled days over scheduled days — a day off the schedule never
 * counts as a miss. N× a week: per week, up to N logged days count against
 * N (scaled down for a week the window only partly covers). Today, and for
 * a weekly count the week that holds it, can only add, never count against.
 */
export function scheduledAdherence(dates: string[], done: Set<string>, schedule: ItemSchedule | undefined, today: string): ScheduledAdherence {
  const doneCount = dates.filter((d) => done.has(d)).length;
  if (!schedule || schedule.kind === "days") {
    const expectedDays = dates.filter((d) => isScheduledDay(schedule, d) && (d !== today || done.has(d)));
    const hit = expectedDays.filter((d) => done.has(d)).length;
    return { pct: expectedDays.length === 0 ? null : round1((hit / expectedDays.length) * 100), done: doneCount };
  }
  const weeks = new Map<string, string[]>();
  for (const d of dates) {
    const w = isoWeekStart(d);
    const list = weeks.get(w) ?? [];
    list.push(d);
    weeks.set(w, list);
  }
  const currentWeek = isoWeekStart(today);
  let expected = 0;
  let achieved = 0;
  for (const [week, days] of weeks) {
    const logged = days.filter((d) => done.has(d)).length;
    const target = week === currentWeek ? Math.min(schedule.times, logged) : Math.min(schedule.times, Math.round((schedule.times * days.length) / 7));
    expected += target;
    achieved += Math.min(target, logged);
  }
  return { pct: expected === 0 ? null : round1((achieved / expected) * 100), done: doneCount };
}

/** A streak over the days the schedule expects — null for a weekly count,
 * where a run of days means nothing. A current streak isn't broken by
 * `today` before it's been logged. */
export function scheduledStreak(
  dates: string[],
  done: Set<string>,
  schedule: ItemSchedule | undefined,
  kind: "current" | "longest",
  today: string,
): number | null {
  if (schedule?.kind === "weekly") return null;
  const expected = dates.filter((d) => isScheduledDay(schedule, d) && (kind === "longest" || d !== today || done.has(d)));
  return kind === "current" ? computeCurrentStreak(expected, done) : computeLongestStreak(expected, done);
}
