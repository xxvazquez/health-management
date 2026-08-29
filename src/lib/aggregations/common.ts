import type { CanonicalEvent } from "@/lib/types";

export interface DateRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

/** Generic over anything date-stamped (CanonicalEvent, RawWorkoutLog, …) so the
 * same date-range filter panel works on every analytics page, not just
 * ones built on CanonicalEvent. */
export function filterByDateRange<T extends { date: string }>(events: T[], range?: DateRange): T[] {
  if (!range) return events;
  return events.filter((e) => e.date >= range.start && e.date <= range.end);
}

export function getDatasetSpan<T extends { date: string }>(events: T[]): DateRange | null {
  if (events.length === 0) return null;
  let start = events[0].date;
  let end = events[0].date;
  for (const e of events) {
    if (e.date < start) start = e.date;
    if (e.date > end) end = e.date;
  }
  return { start, end };
}

/** All calendar dates between start and end, inclusive, ascending. */
export function listDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  while (cur <= endDate) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/** Today's date as YYYY-MM-DD in the browser's local timezone (not UTC —
 * `addDaysToDate` and friends work in UTC since they only ever shift an
 * already-known date, but "today" itself must reflect the user's own
 * clock, or a log made late at night could land on the wrong calendar
 * day). Shared by every page that needs "today" as a default/max date.
 *
 * The day rolls over at 03:00, not midnight: someone still up at 00:40 is
 * having "today", so anything between midnight and 3 AM counts as the
 * previous calendar date everywhere the app talks about "today". */
export function todayLocalISODate(): string {
  const d = new Date();
  if (d.getHours() < 3) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Dates (across the whole dataset, any item) on which anything was tracked at all. */
export function trackedCalendarDates(events: CanonicalEvent[]): Set<string> {
  return new Set(events.map((e) => e.date));
}

/**
 * Current streak over an item's *tracked* days only — gaps where the item
 * wasn't tracked at all don't count as breaks. This avoids penalizing a
 * supplement for days it simply wasn't logged, per the not-tracked vs
 * did-not-happen distinction the whole app is built around. Walks back from
 * the most recently tracked day until the first miss.
 */
export function computeCurrentStreak(trackedDatesAscending: string[], completedDates: Set<string>): number {
  let current = 0;
  for (let i = trackedDatesAscending.length - 1; i >= 0; i--) {
    if (!completedDates.has(trackedDatesAscending[i])) break;
    current++;
  }
  return current;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return round1((numerator / denominator) * 100);
}

export function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** "Aug 26" — for chart axis ticks once a range is long enough that
 * per-day labels would be unreadable. Works on any date, not just a
 * month-start one, since only the month/year are read. */
export function formatMonthYear(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const month = d.toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
  const year = String(d.getUTCFullYear()).slice(-2);
  return `${month} ${year}`;
}

/** "7h 30m" style — for any minutes-valued observation (currently just
 * sleep duration). Omits the hours/minutes part when it's zero, so a
 * 45-minute nap reads as "45m", not "0h 45m". */
export function formatMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
