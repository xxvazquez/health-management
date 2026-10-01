import type { CanonicalEvent, RawStoolLog } from "@/lib/types";
import { addDaysToDate, daysBetween, listDatesBetween, pct, round1, symptomTrackedDates, type DateRange } from "./common";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";

/**
 * Dates any bowel movement was logged — "we know the outcome that day" for
 * cross-domain Bristol comparisons. Deliberately every entry, not just a
 * specific type's own dates: using a single type's occurred-dates as its
 * own tracked-set would make tracked ≈ occurred by construction and
 * collapse the comparison toward 0 regardless of the real signal.
 */
export function bristolAssessedDates(stoolLogs: RawStoolLog[]): Set<string> {
  return new Set(stoolLogs.map((s) => s.date));
}

/**
 * Dates where a logged Bristol reading was one of the given scores (e.g.
 * `[3, 4]`) — the building block for any Bristol comparison. An entry with
 * more than one score counts if any of them matches.
 */
export function bristolTypeDates(stoolLogs: RawStoolLog[], scores: readonly number[]): Set<string> {
  const wanted = new Set(scores);
  return new Set(stoolLogs.filter((s) => s.bristolScores.some((sc) => wanted.has(sc))).map((s) => s.date));
}

/** Every individual Bristol reading, flattened out of its parent entry —
 * the unit every numeric Bristol stat (band distribution, target-range
 * share, the score chart) operates on, since one entry can carry more than
 * one score and each stays its own data point rather than being merged or
 * averaged away. */
function flattenedBristolScores(stoolLogs: RawStoolLog[]): { id: string; date: string; loggedAt: string; score: number }[] {
  return stoolLogs.flatMap((s) => s.bristolScores.map((score) => ({ id: s.id, date: s.date, loggedAt: s.loggedAt, score })));
}

type BristolBand = "Hard (1–2)" | "Normal (3–4)" | "Loose (5–7)";

/** Standard Bristol banding (1–2 harder/constipated, 3–4 normal, 5–7
 * looser/diarrhea) — display-only grouping computed here at render time,
 * never stored. `bristolScore` itself always stays the raw 1–7 value
 * everywhere else; this page never asserts a medical reading of it, only
 * describes what was logged. */
function bandForScore(score: number): BristolBand | null {
  if (score <= 2) return "Hard (1–2)";
  if (score <= 4) return "Normal (3–4)";
  if (score <= 7) return "Loose (5–7)";
  return null;
}

export interface BristolBandEntry {
  band: BristolBand;
  count: number;
  sharePct: number;
}

/** Coarser 3-band grouping of classified Bristol readings, for a quicker
 * read than 7 separate types — counts individual readings, not entries, so
 * a bowel movement logged as both Bristol 1 and 3 contributes to both
 * bands rather than being forced into one or the other. */
export function bristolBandDistribution(stoolLogs: RawStoolLog[]): BristolBandEntry[] {
  const scores = flattenedBristolScores(stoolLogs);
  const total = scores.length;
  const counts = new Map<BristolBand, number>();
  for (const s of scores) {
    const band = bandForScore(s.score);
    if (!band) continue;
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  const order: BristolBand[] = ["Hard (1–2)", "Normal (3–4)", "Loose (5–7)"];
  return order
    .filter((band) => counts.has(band))
    .map((band) => ({ band, count: counts.get(band) ?? 0, sharePct: pct(counts.get(band) ?? 0, total) }));
}

export interface BristolScorePoint {
  id: string;
  date: string;
  value: number;
}

/**
 * Every Bristol reading, chronological, as one numeric 1–7 series — the
 * single-line "Bristol over time" chart. Multiple same-day readings are
 * never merged or averaged into an invented value — each stays its own
 * point, ordered by `loggedAt`.
 */
export function bristolScoreSeries(stoolLogs: RawStoolLog[]): BristolScorePoint[] {
  return flattenedBristolScores(stoolLogs)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.loggedAt.localeCompare(b.loggedAt);
    })
    .map(({ id, date, score }, i) => ({ id: `${id}:${i}`, date, value: score }));
}

export interface StoolDistributionEntry {
  label: string;
  count: number;
  sharePct: number;
}

/** Distribution of logged stool color, entries with no color set excluded. */
export function stoolColorDistribution(stoolLogs: RawStoolLog[]): StoolDistributionEntry[] {
  const withColor = stoolLogs.filter((s) => s.color != null);
  const total = withColor.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const s of withColor) counts.set(s.color as string, (counts.get(s.color as string) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, sharePct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

/** Distribution of logged hygiene grades/methods. One entry can record more
 * than one, so shares are out of entries-with-any-hygiene and can sum past
 * 100%. Entries with none set are excluded. */
export function hygieneDistribution(stoolLogs: RawStoolLog[]): StoolDistributionEntry[] {
  const withValue = stoolLogs.filter((s) => s.hygiene.length > 0);
  const total = withValue.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const s of withValue) for (const h of s.hygiene) counts.set(h, (counts.get(h) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, sharePct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
}

/** Average minutes spent on the toilet, across entries that logged a duration. */
export function averageTimeOnToiletMinutes(stoolLogs: RawStoolLog[]): number | null {
  const withDuration = stoolLogs.filter((s) => s.timeOnToiletMinutes != null);
  if (withDuration.length === 0) return null;
  return round1(withDuration.reduce((sum, s) => sum + (s.timeOnToiletMinutes as number), 0) / withDuration.length);
}

export function digestiveSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.category === "Digestive Symptom");
}

/** The same-length period just before `range`. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.start, range.end) + 1;
  return { start: addDaysToDate(range.start, -len), end: addDaysToDate(range.start, -1) };
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export interface MovementSummary {
  count: number;
  /** Bowel movements a day, over the range from the first one ever logged. */
  perDay: number | null;
}

export function movementSummary(stoolLogs: RawStoolLog[], range: DateRange): MovementSummary {
  const first = stoolLogs.reduce<string | null>((min, s) => (min === null || s.date < min ? s.date : min), null);
  const count = stoolLogs.filter((s) => inRange(s.date, range)).length;
  if (!first || first > range.end) return { count, perDay: null };
  const start = first > range.start ? first : range.start;
  return { count, perDay: round1(count / (daysBetween(start, range.end) + 1)) };
}

export interface SymptomDaysCount {
  /** Days with at least one matching symptom. */
  days: number;
  /** Days symptoms were being logged at all — the honest denominator. */
  trackedDays: number;
}

function symptomDays(events: CanonicalEvent[], range: DateRange, tracked: Set<string>, item?: string): SymptomDaysCount {
  const present = new Set(
    events.filter((e) => e.category === "Digestive Symptom" && e.completed && (!item || e.item === item) && inRange(e.date, range)).map((e) => e.date),
  );
  return { days: present.size, trackedDays: [...tracked].filter((d) => inRange(d, range)).length };
}

/** Days with any digestive symptom in `range` and the period before it. */
export function digestiveSymptomDays(events: CanonicalEvent[], range: DateRange): { now: SymptomDaysCount; before: SymptomDaysCount } {
  const tracked = symptomTrackedDates(events);
  return { now: symptomDays(events, range, tracked), before: symptomDays(events, previousRange(range), tracked) };
}

export type TimeOfDay = "Morning" | "Afternoon" | "Evening" | "Night";

export function timeOfDay(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 22) return "Evening";
  return "Night";
}

export interface SymptomPeriodBar {
  date: string;
  /** Share of the bucket's tracked days with the symptom, 0–1; null when
   * symptoms weren't logged at all then. */
  value: number | null;
}

export interface DigestiveSymptomDetail {
  now: SymptomDaysCount;
  before: SymptomDaysCount;
  /** One bar a day for ranges up to 92 days, one a week beyond that. */
  bars: SymptomPeriodBar[];
  barUnit: "day" | "week";
  mostOften: TimeOfDay | null;
  /** The most recent occurrence ever: its date and, when known, its log time. */
  last: { date: string; at: string | null } | null;
}

const MAX_DAILY_BARS = 92;

export function digestiveSymptomDetail(events: CanonicalEvent[], item: string, range: DateRange): DigestiveSymptomDetail {
  const tracked = symptomTrackedDates(events);
  const occurrences = events.filter((e) => e.category === "Digestive Symptom" && e.completed && e.item === item);
  const presentDates = new Set(occurrences.map((e) => e.date));

  const dates = listDatesBetween(range.start, range.end);
  const barUnit = dates.length > MAX_DAILY_BARS ? "week" : "day";
  const step = barUnit === "week" ? 7 : 1;
  const bars: SymptomPeriodBar[] = [];
  for (let i = 0; i < dates.length; i += step) {
    const bucket = dates.slice(i, i + step).filter((d) => tracked.has(d));
    bars.push({ date: dates[i], value: bucket.length === 0 ? null : bucket.filter((d) => presentDates.has(d)).length / bucket.length });
  }

  const counts = new Map<TimeOfDay, number>();
  for (const e of occurrences) {
    if (!inRange(e.date, range) || !e.updatedAt) continue;
    const t = timeOfDay(new Date(e.updatedAt).getHours());
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const mostOften = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const latest = occurrences.reduce<CanonicalEvent | null>(
    (best, e) => (!best || e.date > best.date || (e.date === best.date && (e.updatedAt ?? "") > (best.updatedAt ?? "")) ? e : best),
    null,
  );

  return {
    now: symptomDays(events, range, tracked, item),
    before: symptomDays(events, previousRange(range), tracked, item),
    bars,
    barUnit,
    mostOften,
    last: latest ? { date: latest.date, at: latest.updatedAt } : null,
  };
}

/** Stool characteristics and movement symptoms as one list — how many of
 * the range's bowel movements had each. */
export function withMovementStats(stoolLogs: RawStoolLog[]): { label: string; count: number; total: number }[] {
  const total = stoolLogs.length;
  const counts = new Map<string, number>();
  for (const s of stoolLogs) for (const label of new Set([...s.characteristics, ...s.symptoms])) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].map(([label, count]) => ({ label, count, total })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
