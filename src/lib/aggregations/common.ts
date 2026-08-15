import type { CanonicalEvent } from "@/lib/types";

export interface DateRange {
  start: string; // YYYY-MM-DD, inclusive
  end: string; // YYYY-MM-DD, inclusive
}

export function filterByDateRange(events: CanonicalEvent[], range?: DateRange): CanonicalEvent[] {
  if (!range) return events;
  return events.filter((e) => e.date >= range.start && e.date <= range.end);
}

export function getDatasetSpan(events: CanonicalEvent[]): DateRange | null {
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

export function addDaysToDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Dates (across the whole dataset, any item) on which anything was tracked at all. */
export function trackedCalendarDates(events: CanonicalEvent[]): Set<string> {
  return new Set(events.map((e) => e.date));
}

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Streaks over an item's *tracked* days only — gaps where the item wasn't
 * tracked at all don't count as breaks. This avoids penalizing a supplement
 * for days it simply wasn't logged, per the not-tracked vs did-not-happen
 * distinction the whole app is built around.
 */
export function computeStreaks(trackedDatesAscending: string[], completedDates: Set<string>): StreakResult {
  let longest = 0;
  let running = 0;
  let current = 0;

  for (let i = 0; i < trackedDatesAscending.length; i++) {
    const date = trackedDatesAscending[i];
    if (completedDates.has(date)) {
      running++;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  // Current streak: walk back from the most recently tracked day.
  for (let i = trackedDatesAscending.length - 1; i >= 0; i--) {
    if (completedDates.has(trackedDatesAscending[i])) {
      current++;
    } else {
      break;
    }
  }

  return { currentStreak: current, longestStreak: longest };
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
