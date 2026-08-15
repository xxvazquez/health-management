import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, isoWeekStart, pct, trackedCalendarDates } from "./common";
import { computeItemStats, type ItemStats } from "./itemStats";

/** The five classified Bristol types this app tracks. "No Bristol" is a logged entry meaning
 * "checked, but couldn't classify" — it is deliberately NOT one of these types; see
 * `unclassifiedStoolStats` below, which reports it as its own, separate quantity. */
const BRISTOL_TYPES = ["Bristol 1", "Bristol 2", "Bristol 3", "Bristol 4", "Bristol 5"];
const NO_BRISTOL_ITEM = "No Bristol";

export interface BristolDistributionEntry {
  item: string;
  count: number;
  sharePct: number;
}

function bristolEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return events.filter((e) => e.subcategory === "Bristol Scale" && e.completed);
}

/**
 * Bristol type distribution among CLASSIFIED entries only (Bristol 1–5).
 * "No Bristol" entries are excluded here — they aren't a type of stool, they're
 * an explicit "unclassified" log — and are surfaced separately via
 * `unclassifiedStoolStats`.
 */
export function bristolDistribution(events: CanonicalEvent[]): BristolDistributionEntry[] {
  const bristol = bristolEvents(events).filter((e) => e.item !== NO_BRISTOL_ITEM);
  const total = bristol.length;
  const counts = new Map<string, number>();
  for (const e of bristol) counts.set(e.item, (counts.get(e.item) ?? 0) + 1);
  return BRISTOL_TYPES.filter((item) => counts.has(item)).map((item) => ({
    item,
    count: counts.get(item) ?? 0,
    sharePct: pct(counts.get(item) ?? 0, total),
  }));
}

export interface UnclassifiedStoolStats {
  /** Days logged as "No Bristol" — checked, but not classifiable into a type. */
  unclassifiedCount: number;
  /** Days a classified Bristol type (1–5) was logged. */
  classifiedCount: number;
  /** Share of all logged stool entries (classified + unclassified) that were unclassified. */
  unclassifiedSharePct: number;
}

/** Explicit accounting of "checked but unclassified" stool entries — never folded into the type distribution. */
export function unclassifiedStoolStats(events: CanonicalEvent[]): UnclassifiedStoolStats {
  const bristol = bristolEvents(events);
  const unclassifiedCount = bristol.filter((e) => e.item === NO_BRISTOL_ITEM).length;
  const classifiedCount = bristol.length - unclassifiedCount;
  return {
    unclassifiedCount,
    classifiedCount,
    unclassifiedSharePct: pct(unclassifiedCount, bristol.length),
  };
}

export type BristolBand = "Loose (1–2)" | "Normal (3–4)" | "Hard (5)";

/**
 * Clinical Bristol banding, adapted to the 5 discrete types this app's
 * source data actually tracks (it doesn't distinguish types 6/7 from 5).
 * Types 1–2 read as harder/constipated in the standard 7-point scale, but
 * this app's own type labels run the opposite direction (5 = loosest), so
 * banding is named descriptively rather than by clinical type number to
 * avoid implying a 7-point mapping the data doesn't have.
 */
const BRISTOL_BAND_BY_TYPE: Record<string, BristolBand> = {
  "Bristol 1": "Loose (1–2)",
  "Bristol 2": "Loose (1–2)",
  "Bristol 3": "Normal (3–4)",
  "Bristol 4": "Normal (3–4)",
  "Bristol 5": "Hard (5)",
};

export interface BristolBandEntry {
  band: BristolBand;
  count: number;
  sharePct: number;
}

/** Coarser 3-band grouping of classified Bristol entries, for a quicker read than 5 separate types. */
export function bristolBandDistribution(events: CanonicalEvent[]): BristolBandEntry[] {
  const bristol = bristolEvents(events).filter((e) => e.item !== NO_BRISTOL_ITEM);
  const total = bristol.length;
  const counts = new Map<BristolBand, number>();
  for (const e of bristol) {
    const band = BRISTOL_BAND_BY_TYPE[e.item];
    if (!band) continue;
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  const order: BristolBand[] = ["Loose (1–2)", "Normal (3–4)", "Hard (5)"];
  return order
    .filter((band) => counts.has(band))
    .map((band) => ({ band, count: counts.get(band) ?? 0, sharePct: pct(counts.get(band) ?? 0, total) }));
}

export interface BristolRollingPoint {
  date: string;
  /** Share of the trailing 14-day window's *classified* entries in each band, plus unclassified share of all entries. */
  loosePct: number;
  normalPct: number;
  hardPct: number;
  unclassifiedPct: number;
}

const ROLLING_WINDOW_DAYS = 14;

/** Rolling 14-day band proportions over time — how the stool pattern has been shifting recently. */
export function bristolRollingBands(events: CanonicalEvent[]): BristolRollingPoint[] {
  const bristol = bristolEvents(events);
  if (bristol.length === 0) return [];
  const byDate = new Map<string, string>(); // date -> item (one stool entry per day expected)
  for (const e of bristol) byDate.set(e.date, e.item);
  const dates = Array.from(byDate.keys()).sort();

  const points: BristolRollingPoint[] = [];
  for (const date of dates) {
    const windowStart = addDaysToDate(date, -(ROLLING_WINDOW_DAYS - 1));
    let loose = 0;
    let normal = 0;
    let hard = 0;
    let unclassified = 0;
    let total = 0;
    for (const d of dates) {
      if (d < windowStart || d > date) continue;
      total++;
      const item = byDate.get(d)!;
      if (item === NO_BRISTOL_ITEM) unclassified++;
      else if (BRISTOL_BAND_BY_TYPE[item] === "Loose (1–2)") loose++;
      else if (BRISTOL_BAND_BY_TYPE[item] === "Normal (3–4)") normal++;
      else if (BRISTOL_BAND_BY_TYPE[item] === "Hard (5)") hard++;
    }
    points.push({
      date,
      loosePct: pct(loose, total),
      normalPct: pct(normal, total),
      hardPct: pct(hard, total),
      unclassifiedPct: pct(unclassified, total),
    });
  }
  return points;
}

export interface BristolTimelinePoint {
  date: string;
  item: string;
}

export function bristolTimeline(events: CanonicalEvent[]): BristolTimelinePoint[] {
  return bristolEvents(events)
    .map((e) => ({ date: e.date, item: e.item }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function stoolQualityStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.subcategory === "Stool Quality"),
    activeDates,
  );
}

export function digestiveSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.category === "Digestive Symptom"),
    activeDates,
  );
}

export function otherSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.category === "Other Symptom"),
    activeDates,
  );
}

export interface SymptomWeeklyPoint {
  weekStart: string;
  counts: Record<string, number>;
}

/** Weekly symptom-occurrence counts per symptom item, for a trend chart. */
export function symptomFrequencyOverTime(events: CanonicalEvent[]): SymptomWeeklyPoint[] {
  const symptomEvents = events.filter(
    (e) => (e.category === "Digestive Symptom" || e.category === "Other Symptom") && e.completed,
  );
  const byWeek = new Map<string, Record<string, number>>();
  for (const e of symptomEvents) {
    const week = isoWeekStart(e.date);
    const rec = byWeek.get(week) ?? {};
    rec[e.item] = (rec[e.item] ?? 0) + 1;
    byWeek.set(week, rec);
  }
  return Array.from(byWeek.entries())
    .map(([weekStart, counts]) => ({ weekStart, counts }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
