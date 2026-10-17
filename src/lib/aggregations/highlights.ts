import type { CanonicalEvent, RawStoolLog, RawWorkoutLog, WorkoutUnit } from "@/lib/types";
import type { CheckIn } from "@/lib/supabase/checkins";
import type { TrackedDomain } from "@/lib/visibleDomains";
import { ANALYTICS_START_DATE } from "@/lib/config";
import { INPUT_KIND } from "@/taxonomy/inputKinds";
import { addDaysToDate, listDatesBetween, similarCoverage, symptomTrackedDates, trackedCalendarDates, type DateRange } from "./common";
import { computeItemStatsForFilter } from "./itemStats";
import { scheduledAdherence, type ItemSchedule } from "./schedule";
import { bristolAssessedDates, bristolTypeDates } from "./digestion";

/** Each highlight compares this many days, ending yesterday, with the same
 * stretch just before. */
export const HIGHLIGHT_WINDOW_DAYS = 30;

/** How a highlight's two numbers read. */
export type HighlightFormat = "count" | "minutes" | "score" | "percent";

export interface Highlight {
  id: string;
  /** Short caption above the title: the section it comes from. */
  section: string;
  /** What changed, in a few words ("More steps", "Vitamin D · less often"). */
  title: string;
  now: number;
  before: number;
  format: HighlightFormat;
  /** Unit after the number ("steps a day", "days"). */
  unit: string;
  /** Bars run from zero to this. */
  scaleMax: number;
  /** The Log section it belongs to; hidden sections drop their highlights. */
  domain: TrackedDomain | null;
  /** The Trends tab that shows it in full, if any. */
  tab: string | null;
  /** Size of the change, 0–1, for ordering. */
  score: number;
}

export interface HighlightInput {
  events: CanonicalEvent[];
  workoutLogs: RawWorkoutLog[];
  stoolLogs: RawStoolLog[];
  checkIns: CheckIn[];
  unitByExercise: Map<string, WorkoutUnit>;
  schedules: Record<string, ItemSchedule>;
  today: string;
}

/** Fewest days with a value in each window before averages are compared. */
const MIN_VALUE_DAYS = 10;
const MIN_CHECKIN_DAYS = 7;
/** Fewest days symptom logging was active in each window. */
const MIN_SYMPTOM_TRACKED_DAYS = 20;
/** An item with no schedule counts as daily only once it was taken on at
 * least this share of days in one window; below that it's taken as needed. */
const AS_NEEDED_MAX_PCT = 50;

export function highlightWindows(today: string): { now: DateRange; before: DateRange } {
  const end = addDaysToDate(today, -1);
  const start = addDaysToDate(end, -(HIGHLIGHT_WINDOW_DAYS - 1));
  return {
    now: { start, end },
    before: { start: addDaysToDate(start, -HIGHLIGHT_WINDOW_DAYS), end: addDaysToDate(start, -1) },
  };
}

const inRange = (date: string, r: DateRange) => date >= r.start && date <= r.end;

function average(values: number[]): number {
  return values.reduce((n, v) => n + v, 0) / values.length;
}

function changeScore(now: number, before: number): number {
  const top = Math.max(Math.abs(now), Math.abs(before));
  return top === 0 ? 0 : Math.abs(now - before) / top;
}

/** A day's value for each date in the window (the highest, if logged twice). */
function dailyValues<T>(rows: T[], date: (r: T) => string, value: (r: T) => number | null, r: DateRange): number[] {
  const byDate = new Map<string, number>();
  for (const row of rows) {
    const v = value(row);
    const d = date(row);
    if (v == null || !inRange(d, r)) continue;
    byDate.set(d, Math.max(byDate.get(d) ?? -Infinity, v));
  }
  return [...byDate.values()];
}

/**
 * What changed most between the last 30 days and the 30 before, across the
 * sections. Nothing is compared on days a section wasn't being logged: an
 * average only uses days with a value, a count only runs when both windows
 * were logged on a similar number of days, and adherence follows each
 * item's schedule. A change has to clear a floor to count as a highlight.
 */
export function computeHighlights(input: HighlightInput): Highlight[] {
  const { events, workoutLogs, stoolLogs, checkIns, unitByExercise, schedules, today } = input;
  const w = highlightWindows(today);
  const out: Highlight[] = [];
  const add = (h: Omit<Highlight, "score">, minDiff: number, minRatio: number) => {
    const diff = Math.abs(h.now - h.before);
    const score = changeScore(h.now, h.before);
    if (diff >= minDiff && score >= minRatio) out.push({ ...h, score });
  };
  // Everything but workouts starts at the analytics start date.
  const beforeInWindow = w.before.start >= ANALYTICS_START_DATE;
  const appDays = trackedCalendarDates(events);
  for (const l of workoutLogs) appDays.add(l.date);
  const appDaysIn = (r: DateRange) => [...appDays].filter((d) => inRange(d, r)).length;

  // Steps: the daily average over days with a count.
  const steps = workoutLogs.filter((l) => unitByExercise.get(l.exercise) === "steps");
  const stepsNow = dailyValues(steps, (l) => l.date, (l) => l.weightKg, w.now);
  const stepsBefore = dailyValues(steps, (l) => l.date, (l) => l.weightKg, w.before);
  if (stepsNow.length >= MIN_VALUE_DAYS && stepsBefore.length >= MIN_VALUE_DAYS) {
    const now = Math.round(average(stepsNow));
    const before = Math.round(average(stepsBefore));
    add(
      { id: "steps", section: "Steps", title: now > before ? "More steps" : "Fewer steps", now, before, format: "count", unit: "steps a day", scaleMax: Math.max(now, before), domain: "workout", tab: "workout" },
      500,
      0.1,
    );
  }

  // Training days: only once workouts were logged before both windows,
  // and the app was used about as often in each.
  const training = workoutLogs.filter((l) => unitByExercise.has(l.exercise) && unitByExercise.get(l.exercise) !== "steps");
  const firstTraining = training.reduce<string | null>((min, l) => (min === null || l.date < min ? l.date : min), null);
  if (firstTraining && firstTraining <= w.before.start && similarCoverage(appDaysIn(w.now), appDaysIn(w.before))) {
    const days = (r: DateRange) => new Set(training.filter((l) => inRange(l.date, r)).map((l) => l.date)).size;
    const now = days(w.now);
    const before = days(w.before);
    add(
      { id: "training", section: "Workout", title: now > before ? "More training days" : "Fewer training days", now, before, format: "count", unit: "days", scaleMax: Math.max(now, before), domain: "workout", tab: "workout" },
      2,
      0.2,
    );
  }

  if (!beforeInWindow) return rank(out);

  // Sleep and other measured habits: the average over nights logged.
  const measured = new Set(Object.keys(INPUT_KIND));
  const sleep = events.filter((e) => e.itemType === "habit" && measured.has(e.item) && e.completed && e.value != null);
  const sleepNow = dailyValues(sleep, (e) => e.date, (e) => e.value, w.now);
  const sleepBefore = dailyValues(sleep, (e) => e.date, (e) => e.value, w.before);
  if (sleepNow.length >= MIN_VALUE_DAYS && sleepBefore.length >= MIN_VALUE_DAYS) {
    const now = Math.round(average(sleepNow));
    const before = Math.round(average(sleepBefore));
    add(
      { id: "sleep", section: "Sleep", title: now > before ? "More sleep" : "Less sleep", now, before, format: "minutes", unit: "a night", scaleMax: Math.max(now, before), domain: "habit", tab: "habits" },
      20,
      0.04,
    );
  }

  // Check-in mood and energy, averaged over the days each was rated.
  for (const [field, section, up, down] of [
    ["mood", "Mood", "Better mood", "Lower mood"],
    ["energy", "Energy", "More energy", "Lower energy"],
  ] as const) {
    const now = dailyValues(checkIns, (c) => c.date, (c) => c[field], w.now);
    const before = dailyValues(checkIns, (c) => c.date, (c) => c[field], w.before);
    if (now.length < MIN_CHECKIN_DAYS || before.length < MIN_CHECKIN_DAYS) continue;
    const a = Math.round(average(now) * 10) / 10;
    const b = Math.round(average(before) * 10) / 10;
    add({ id: field, section, title: a > b ? up : down, now: a, before: b, format: "score", unit: "out of 5", scaleMax: 5, domain: null, tab: null }, 0.4, 0);
  }

  // Symptoms: days each one came up, on days symptom logging was active.
  const symptomTracked = symptomTrackedDates(events);
  const trackedNow = listDatesBetween(w.now.start, w.now.end).filter((d) => symptomTracked.has(d)).length;
  const trackedBefore = listDatesBetween(w.before.start, w.before.end).filter((d) => symptomTracked.has(d)).length;
  if (trackedNow >= MIN_SYMPTOM_TRACKED_DAYS && trackedBefore >= MIN_SYMPTOM_TRACKED_DAYS && similarCoverage(trackedNow, trackedBefore)) {
    const daysBySymptom = new Map<string, { now: Set<string>; before: Set<string> }>();
    for (const e of events) {
      if (e.itemType !== "outcome" || !e.completed || !symptomTracked.has(e.date)) continue;
      const entry = daysBySymptom.get(e.item) ?? { now: new Set(), before: new Set() };
      if (inRange(e.date, w.now)) entry.now.add(e.date);
      else if (inRange(e.date, w.before)) entry.before.add(e.date);
      daysBySymptom.set(e.item, entry);
    }
    for (const [item, d] of daysBySymptom) {
      const now = d.now.size;
      const before = d.before.size;
      add(
        { id: `symptom:${item}`, section: "Symptoms", title: `${now > before ? "More" : "Fewer"} days with ${item}`, now, before, format: "count", unit: "days", scaleMax: Math.max(now, before), domain: "outcome", tab: null },
        3,
        0.3,
      );
    }
  }

  // Supplements and habits against their schedules, for items logged since
  // before both windows and still in use, when the app was used about as
  // often in each.
  const sameUse = similarCoverage(appDaysIn(w.now), appDaysIn(w.before));
  const nowDates = listDatesBetween(w.now.start, w.now.end);
  const beforeDates = listDatesBetween(w.before.start, w.before.end);
  for (const [type, section, domain, tab] of [
    ["supplement", "Supplements", "supplement", "supplements"],
    ["habit", "Habits", "habit", "habits"],
  ] as const) {
    const stats = computeItemStatsForFilter(events, (e) => e.itemType === type && !measured.has(e.item) && !(type === "supplement" && e.category === "Fiber"));
    for (const s of stats) {
      if (!sameUse || s.isArchived || s.firstTrackedDate > w.before.start) continue;
      const done = new Set(events.filter((e) => e.item === s.item && e.completed).map((e) => e.date));
      const schedule = schedules[s.itemIdentity];
      const now = scheduledAdherence(nowDates, done, schedule, today).pct;
      const before = scheduledAdherence(beforeDates, done, schedule, today).pct;
      if (now == null || before == null) continue;
      if (!schedule && Math.max(now, before) < AS_NEEDED_MAX_PCT) continue;
      add(
        { id: `${type}:${s.item}`, section, title: `${s.item} · ${now > before ? "more" : "less"} often`, now: Math.round(now), before: Math.round(before), format: "percent", unit: "of planned days", scaleMax: 100, domain, tab },
        15,
        0,
      );
    }
  }

  // Food variety: different foods eaten, when both windows have a similar
  // number of days with food logged.
  const food = events.filter((e) => e.itemType === "food" && e.completed);
  const foodDays = (r: DateRange) => new Set(food.filter((e) => inRange(e.date, r)).map((e) => e.date)).size;
  const foodDaysNow = foodDays(w.now);
  const foodDaysBefore = foodDays(w.before);
  if (foodDaysNow >= MIN_VALUE_DAYS && foodDaysBefore >= MIN_VALUE_DAYS && similarCoverage(foodDaysNow, foodDaysBefore)) {
    const distinct = (r: DateRange) => new Set(food.filter((e) => inRange(e.date, r)).map((e) => e.item)).size;
    const now = distinct(w.now);
    const before = distinct(w.before);
    add(
      { id: "variety", section: "Food", title: now > before ? "More variety" : "Less variety", now, before, format: "count", unit: "different foods", scaleMax: Math.max(now, before), domain: "food", tab: "food" },
      3,
      0.15,
    );
  }

  // Hard (Bristol 1–2) or loose (5–7) stools, as a share of days with a
  // bowel movement logged.
  const assessed = bristolAssessedDates(stoolLogs);
  const offDays = bristolTypeDates(stoolLogs, [1, 2, 5, 6, 7]);
  const stoolShare = (r: DateRange) => {
    const days = [...assessed].filter((d) => inRange(d, r));
    return { days: days.length, pct: days.length ? Math.round((days.filter((d) => offDays.has(d)).length / days.length) * 100) : 0 };
  };
  const stoolNow = stoolShare(w.now);
  const stoolBefore = stoolShare(w.before);
  if (stoolNow.days >= MIN_VALUE_DAYS && stoolBefore.days >= MIN_VALUE_DAYS) {
    add(
      {
        id: "stool",
        section: "Digestion",
        title: stoolNow.pct > stoolBefore.pct ? "More hard or loose stools" : "Fewer hard or loose stools",
        now: stoolNow.pct,
        before: stoolBefore.pct,
        format: "percent",
        unit: "of days",
        scaleMax: 100,
        domain: "stool",
        tab: "digestion",
      },
      15,
      0,
    );
  }

  return rank(out);
}

function rank(list: Highlight[]): Highlight[] {
  return list.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
