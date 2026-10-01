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

/** Distinct dates with an entry between `start` and `end`, inclusive. */
export function loggedDaysBetween<T extends { date: string }>(events: T[], start: string, end: string): number {
  return new Set(events.filter((e) => e.date >= start && e.date <= end).map((e) => e.date)).size;
}

/** Two windows are only compared by raw counts (unique foods, days eaten)
 * when they were logged on a similar number of days — otherwise a month
 * logged less would read as a month eaten less. */
export function similarCoverage(daysA: number, daysB: number): boolean {
  return daysA > 0 && daysB > 0 && Math.min(daysA, daysB) / Math.max(daysA, daysB) >= 0.8;
}

/** Silence longer than this in a section means it wasn't being tracked. */
export const SECTION_GAP_DAYS = 14;
/** Symptoms can rightly go unlogged for weeks, so they get a longer gap. */
export const SYMPTOM_GAP_DAYS = 30;

/**
 * Days a section (food, supplements, symptoms, …) was really being tracked:
 * app-use days (`activeDates`) from the section's first entry on, minus any
 * stretch where the section went quiet for longer than `gapDays`. The tail
 * after the last entry counts for up to `gapDays`. Only on these days does
 * "nothing logged" mean "didn't happen".
 */
export function sectionTrackedDates(sectionDates: Iterable<string>, activeDates: Iterable<string>, gapDays = SECTION_GAP_DAYS): Set<string> {
  const logged = Array.from(new Set(sectionDates)).sort();
  const result = new Set<string>();
  if (logged.length === 0) return result;
  const loggedSet = new Set(logged);
  let next = 0;
  for (const d of Array.from(new Set([...activeDates, ...logged])).sort()) {
    while (next < logged.length && logged[next] < d) next++;
    if (loggedSet.has(d)) {
      result.add(d);
      continue;
    }
    const prev = next > 0 ? logged[next - 1] : null;
    if (!prev) continue;
    const following = next < logged.length ? logged[next] : null;
    if (following ? daysBetween(prev, following) <= gapDays : daysBetween(prev, d) <= gapDays) result.add(d);
  }
  return result;
}

/** `sectionTrackedDates` for one item type of the canonical events. */
export function trackedDatesForType(events: CanonicalEvent[], itemType: CanonicalEvent["itemType"], gapDays = SECTION_GAP_DAYS): Set<string> {
  return sectionTrackedDates(
    events.filter((e) => e.itemType === itemType && e.completed).map((e) => e.date),
    trackedCalendarDates(events),
    gapDays,
  );
}

/** Days symptom logging was active — when a symptom's absence means it didn't happen. */
export function symptomTrackedDates(events: CanonicalEvent[]): Set<string> {
  return trackedDatesForType(events, "outcome", SYMPTOM_GAP_DAYS);
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

/** Longest run of consecutive *tracked* days that were all completed — the
 * same not-tracked-doesn't-break-it rule as `computeCurrentStreak`. */
export function computeLongestStreak(trackedDatesAscending: string[], completedDates: Set<string>): number {
  let longest = 0;
  let run = 0;
  for (const date of trackedDatesAscending) {
    if (completedDates.has(date)) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
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

/** "31 Aug" — day + short month, no year, for a chart x-axis where the
 * points are days within one selected range. Reads left-to-right at a
 * glance; Recharts thins the ticks when they'd overlap. */
export function formatAxisDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

/** "14-08-26" — day-month-2digit-year, zero-padded so a column of these
 * lines up. For the Results history rows and stat read-outs, where the
 * date is a reference label rather than the headline. */
export function formatDMY(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  return `${d}-${m}-${y.slice(2)}`;
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
