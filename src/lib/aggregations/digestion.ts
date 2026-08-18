import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, isoWeekStart, pct, trackedCalendarDates } from "./common";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";
import type { Bullet, InsightTone } from "./insights";

/** The five classified Bristol types this app tracks. "No Bristol" is a logged entry meaning
 * "checked, but couldn't classify" — it is deliberately NOT one of these types; see
 * `unclassifiedStoolStats` below, which reports it as its own, separate quantity. */
export const BRISTOL_TYPES = ["Bristol 1", "Bristol 2", "Bristol 3", "Bristol 4", "Bristol 5"];
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
 * Dates any Bristol reading (classified or not) was logged — "we know the
 * outcome that day" for cross-domain Bristol comparisons. Deliberately
 * every reading, not just a specific type's own dates: using a single
 * type's occurred-dates as its own tracked-set would make tracked ≈
 * occurred by construction and collapse the comparison toward 0 regardless
 * of the real signal.
 */
export function bristolAssessedDates(events: CanonicalEvent[]): Set<string> {
  return new Set(bristolEvents(events).map((e) => e.date));
}

/**
 * Dates where the logged Bristol reading was one of the given types (e.g.
 * `["Bristol 3", "Bristol 4"]`) — the building block for any Bristol
 * comparison. Individual types are read fresh from `events` every call;
 * nothing here collapses or stores a merged category, so a later
 * comparison distinguishing e.g. Bristol 1–2 from Bristol 5 is just a
 * different `types` argument, not a data-model change.
 */
export function bristolTypeDates(events: CanonicalEvent[], types: readonly string[]): Set<string> {
  const wanted = new Set(types);
  return new Set(bristolEvents(events).filter((e) => wanted.has(e.item)).map((e) => e.date));
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
  return computeItemStatsForFilter(events, (e) => e.subcategory === "Stool Quality");
}

export function digestiveSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.category === "Digestive Symptom");
}

export function otherSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.category === "Other Symptom");
}

/** Fiber intake (still logged via the Supplements tab, since it's something
 * taken rather than an outcome) — surfaced here instead of on the
 * Supplements dashboard, since fiber is tracked for its digestive relevance. */
export function fiberStats(events: CanonicalEvent[]): ItemStats[] {
  return computeItemStatsForFilter(events, (e) => e.itemType === "supplement" && e.category === "Fiber");
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

export interface DigestionInsight {
  insufficientData: boolean;
  headline: string;
  detail: string | null;
  /** Always "neutral" — this page describes what changed, never whether a
   * pattern is good or bad. Bristol Scale banding has an established
   * clinical reading, but Lauva doesn't apply it as a verdict on a
   * person's own data; kept as a field for consistency with other pages'
   * Insight usage, not because a value judgment is ever made here. */
  tone: InsightTone;
  changed: Bullet[];
}

const RECENT_WINDOW_DAYS = 21;
const MIN_RECENT_CLASSIFIED = 4;
const MIN_TRACKED_DAYS_FOR_SYMPTOM_COMPARE = 10;
const SYMPTOM_RATE_DRIFT_PP = 15;

const BAND_DESCRIPTOR: Record<BristolBand, string> = {
  "Loose (1–2)": "looser stools (Bristol 1–2)",
  "Normal (3–4)": "typical, well-formed stools (Bristol 3–4)",
  "Hard (5)": "harder stools (Bristol 5)",
};

/**
 * "Current pattern" — the primary Digestion-page insight. Compares the
 * last 3 weeks' Bristol band mix and digestive-symptom frequency against
 * this person's own overall pattern — never against a clinical norm, and
 * never a diagnosis. Describes what was logged, not what it means
 * medically (no "constipation", "IBS", etc. — those are conclusions this
 * data can't support).
 */
export function digestionInsight(events: CanonicalEvent[]): DigestionInsight {
  const span = getDatasetSpan(events);
  if (!span) {
    return { insufficientData: true, headline: "Not enough recent data to identify a clear pattern.", detail: null, tone: "neutral", changed: [] };
  }

  const windowStart = addDaysToDate(span.end, -(RECENT_WINDOW_DAYS - 1));
  const recentEvents = events.filter((e) => e.date >= windowStart);

  const overallBands = bristolBandDistribution(events);
  const recentBands = bristolBandDistribution(recentEvents);
  const recentClassifiedCount = recentBands.reduce((s, b) => s + b.count, 0);

  if (recentClassifiedCount < MIN_RECENT_CLASSIFIED) {
    return {
      insufficientData: true,
      headline: "Not enough recent observations to identify a stable pattern.",
      detail: overallBands.length > 0 ? "There's older data on this page, but not enough logged in the last 3 weeks to say anything current." : null,
      tone: "neutral",
      changed: [],
    };
  }

  // Personal-change framing only: whether the recent mix matches this
  // person's own historical mix. Never "good"/"bad" — Bristol banding has
  // an established clinical reading, but applying it as a verdict on
  // someone's own tracked data would be exactly the kind of diagnosis
  // this page must not make.
  const recentDominant = [...recentBands].sort((a, b) => b.sharePct - a.sharePct)[0];
  const overallDominant = [...overallBands].sort((a, b) => b.sharePct - a.sharePct)[0];
  const shifted = overallDominant && recentDominant.band !== overallDominant.band;

  // Short, glanceable headline; the specific bands move to `detail` rather
  // than being packed into one long clause-heavy sentence.
  const headline = shifted
    ? "Your recent stool pattern differs from your usual pattern."
    : "Your recent stool pattern is consistent with your usual pattern.";
  const detail = shifted
    ? `Mostly ${BAND_DESCRIPTOR[recentDominant.band]} over the last 3 weeks, compared with mostly ${BAND_DESCRIPTOR[overallDominant.band]} historically.`
    : `Mostly ${BAND_DESCRIPTOR[recentDominant.band]} over the last 3 weeks.`;
  const tone: InsightTone = "neutral";

  const changed: Bullet[] = [];

  const trackedDates = Array.from(trackedCalendarDates(events)).sort();
  const recentTrackedDates = trackedDates.filter((d) => d >= windowStart);
  if (trackedDates.length >= MIN_TRACKED_DAYS_FOR_SYMPTOM_COMPARE && recentTrackedDates.length >= 5) {
    const overallSymptomRate = pct(
      new Set(events.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date)).size,
      trackedDates.length,
    );
    const recentSymptomRate = pct(
      new Set(recentEvents.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date)).size,
      recentTrackedDates.length,
    );
    const diff = recentSymptomRate - overallSymptomRate;
    const compact = `${Math.round(recentSymptomRate)}% recently · ${Math.round(overallSymptomRate)}% usual`;
    if (diff >= SYMPTOM_RATE_DRIFT_PP) {
      changed.push({ label: "Digestive symptoms", detail: "Logged more often than usual over the last 3 weeks.", compact });
    } else if (diff <= -SYMPTOM_RATE_DRIFT_PP) {
      changed.push({ label: "Digestive symptoms", detail: "Logged less often than usual over the last 3 weeks.", compact });
    }
  }

  // Absolute threshold, not a personal-baseline comparison — the wording
  // must not claim "more than usual" since no historical unclassified rate
  // is computed here to actually compare against.
  const unclassifiedRecent = recentEvents.filter((e) => e.subcategory === "Bristol Scale" && e.completed).length - recentClassifiedCount;
  if (recentClassifiedCount + unclassifiedRecent >= 6 && unclassifiedRecent / (recentClassifiedCount + unclassifiedRecent) >= 0.4) {
    const unclassifiedSharePct = Math.round((unclassifiedRecent / (recentClassifiedCount + unclassifiedRecent)) * 100);
    changed.push({
      label: "Unclassified entries",
      detail: "A large share of recent stool logs weren't classifiable into a Bristol type.",
      compact: `${unclassifiedSharePct}% unclassified recently`,
    });
  }

  return { insufficientData: false, headline, detail, tone, changed };
}
