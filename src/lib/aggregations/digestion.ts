import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, isoWeekStart, monthStart, pct, round1, trackedCalendarDates } from "./common";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";
import type { Bullet, InsightTone } from "./insights";

/** The five classified Bristol types this app tracks. "No Bristol" is a logged entry meaning
 * "checked, but couldn't classify" — it is deliberately NOT one of these types; see
 * `unclassifiedStoolStats` below, which reports it as its own, separate quantity. */
export const BRISTOL_TYPES = ["Bristol 1", "Bristol 2", "Bristol 3", "Bristol 4", "Bristol 5"];
const NO_BRISTOL_ITEM = "No Bristol";

/** Numeric score behind each classified Bristol type — 1–5, matching what this
 * app actually tracks (never 6/7: this app's own "Bristol 5" is its loosest
 * bucket, it doesn't distinguish clinical types 5/6/7 from each other). This
 * is what makes a single chronological line chart possible instead of one
 * series per type. */
export const BRISTOL_SCORE: Record<string, number> = {
  "Bristol 1": 1,
  "Bristol 2": 2,
  "Bristol 3": 3,
  "Bristol 4": 4,
  "Bristol 5": 5,
};

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

const TARGET_RANGE_WINDOW_DAYS = 30;
const MIN_WINDOW_ENTRIES = 4;

export interface BristolTargetRangeChange {
  /** True only when even the most recent window lacks enough data to say anything. */
  insufficientData: boolean;
  recentPct: number | null;
  recentTotal: number;
  /** Null when the prior window doesn't have enough data — no comparison offered, but recentPct still stands alone. */
  priorPct: number | null;
  priorTotal: number;
}

/**
 * Last-30-days vs previous-30-days share of stool entries in the 3–4
 * target band — the quantified "how often am I actually in my desired
 * range, and is that changing" comparison the hero insight and the target-
 * range stat tile are built from.
 */
export function bristolTargetRangeChange(events: CanonicalEvent[]): BristolTargetRangeChange {
  const bristol = bristolEvents(events);
  if (bristol.length === 0) {
    return { insufficientData: true, recentPct: null, recentTotal: 0, priorPct: null, priorTotal: 0 };
  }
  const lastDate = bristol.reduce((max, e) => (e.date > max ? e.date : max), bristol[0].date);
  const recentStart = addDaysToDate(lastDate, -(TARGET_RANGE_WINDOW_DAYS - 1));
  const priorEnd = addDaysToDate(recentStart, -1);
  const priorStart = addDaysToDate(priorEnd, -(TARGET_RANGE_WINDOW_DAYS - 1));

  const recent = bristol.filter((e) => e.date >= recentStart && e.date <= lastDate);
  const prior = bristol.filter((e) => e.date >= priorStart && e.date <= priorEnd);

  if (recent.length < MIN_WINDOW_ENTRIES) {
    return { insufficientData: true, recentPct: null, recentTotal: recent.length, priorPct: null, priorTotal: prior.length };
  }

  const shareInTarget = (list: CanonicalEvent[]) => pct(list.filter((e) => BRISTOL_BAND_BY_TYPE[e.item] === "Normal (3–4)").length, list.length);

  return {
    insufficientData: false,
    recentPct: shareInTarget(recent),
    recentTotal: recent.length,
    priorPct: prior.length >= MIN_WINDOW_ENTRIES ? shareInTarget(prior) : null,
    priorTotal: prior.length,
  };
}

export interface BristolScorePoint {
  id: string;
  date: string;
  value: number;
}

/**
 * Every classified Bristol reading, chronological, as one numeric 1–5
 * series — the single-line "Bristol over time" chart. Unclassified ("No
 * Bristol") entries are excluded since they have no numeric value to plot
 * (see `unclassifiedStoolStats`). Multiple same-day readings are never
 * merged or averaged into an invented value — each stays its own point,
 * ordered by `updatedAt` (falling back to `id`) as the only stable
 * same-day tiebreaker available, since logs don't carry a time of day.
 */
export function bristolScoreSeries(events: CanonicalEvent[]): BristolScorePoint[] {
  return bristolEvents(events)
    .filter((e) => e.item !== NO_BRISTOL_ITEM)
    .map((e) => ({ id: e.id, date: e.date, value: BRISTOL_SCORE[e.item], updatedAt: e.updatedAt ?? 0 }))
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map(({ id, date, value }) => ({ id, date, value }));
}

export interface BristolMonthlyAveragePoint {
  monthStart: string;
  avgScore: number;
  count: number;
}

/**
 * Monthly average Bristol score — used in place of `bristolScoreSeries`
 * only once a selected range is long enough (roughly 4+ months) that
 * plotting every individual observation would be an unreadable wall of
 * points. A monthly average necessarily hides day-to-day fluctuation, so
 * it's deliberately not the default view — it only takes over at zoom
 * levels where the per-observation line stops being readable anyway.
 */
export function bristolMonthlyScoreAverage(events: CanonicalEvent[]): BristolMonthlyAveragePoint[] {
  const scored = bristolEvents(events)
    .filter((e) => e.item !== NO_BRISTOL_ITEM)
    .map((e) => ({ month: monthStart(e.date), value: BRISTOL_SCORE[e.item] }));

  const byMonth = new Map<string, { sum: number; count: number }>();
  for (const e of scored) {
    const bucket = byMonth.get(e.month) ?? { sum: 0, count: 0 };
    bucket.sum += e.value;
    bucket.count += 1;
    byMonth.set(e.month, bucket);
  }

  return Array.from(byMonth.entries())
    .map(([month, { sum, count }]) => ({ monthStart: month, avgScore: round1(sum / count), count }))
    .sort((a, b) => a.monthStart.localeCompare(b.monthStart));
}

const SYMPTOM_RATE_WINDOW_DAYS = 30;
const MIN_SYMPTOM_WINDOW_TRACKED_DAYS = 5;

export interface DigestiveSymptomRateChange {
  insufficientData: boolean;
  recentPct: number | null;
  priorPct: number | null;
}

/**
 * Last-30-days vs previous-30-days share of tracked days with a digestive
 * symptom logged — the "at a glance" companion to `bristolTargetRangeChange`.
 * Uses every tracked (not just Bristol-assessed) day as the denominator,
 * since a symptom day is meaningful whether or not a stool was also logged.
 */
export function digestiveSymptomRateChange(events: CanonicalEvent[]): DigestiveSymptomRateChange {
  const trackedDates = Array.from(trackedCalendarDates(events)).sort();
  if (trackedDates.length === 0) return { insufficientData: true, recentPct: null, priorPct: null };
  const lastDate = trackedDates[trackedDates.length - 1];
  const recentStart = addDaysToDate(lastDate, -(SYMPTOM_RATE_WINDOW_DAYS - 1));
  const priorEnd = addDaysToDate(recentStart, -1);
  const priorStart = addDaysToDate(priorEnd, -(SYMPTOM_RATE_WINDOW_DAYS - 1));

  const symptomDates = new Set(events.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date));
  const recentTracked = trackedDates.filter((d) => d >= recentStart && d <= lastDate);
  const priorTracked = trackedDates.filter((d) => d >= priorStart && d <= priorEnd);

  if (recentTracked.length < MIN_SYMPTOM_WINDOW_TRACKED_DAYS) {
    return { insufficientData: true, recentPct: null, priorPct: null };
  }
  return {
    insufficientData: false,
    recentPct: pct(recentTracked.filter((d) => symptomDates.has(d)).length, recentTracked.length),
    priorPct:
      priorTracked.length >= MIN_SYMPTOM_WINDOW_TRACKED_DAYS
        ? pct(priorTracked.filter((d) => symptomDates.has(d)).length, priorTracked.length)
        : null,
  };
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
const MIN_TRACKED_DAYS_FOR_SYMPTOM_COMPARE = 10;
const SYMPTOM_RATE_DRIFT_PP = 15;
/** Minimum percentage-point gap between the two 30-day windows worth calling out in `detail` — below this, the two windows read as "about the same" rather than manufacturing a direction out of noise. */
const TARGET_RANGE_NOTABLE_DIFF_PP = 10;

/**
 * "Current pattern" — the primary Digestion-page insight. Leads with the
 * quantified last-30-days-vs-previous-30-days share of stool entries in
 * the 3–4 target range (the actual question this page exists to answer —
 * "how often am I in my desired range, and is that changing"), then adds
 * digestive-symptom-frequency and unclassified-entry drift as supporting
 * bullets. Never a diagnosis — describes what was logged, not what it
 * means medically (no "constipation", "IBS", etc.).
 */
export function digestionInsight(events: CanonicalEvent[]): DigestionInsight {
  const rangeChange = bristolTargetRangeChange(events);
  if (rangeChange.insufficientData) {
    return {
      insufficientData: true,
      headline: "Not enough recent observations to identify a stable pattern.",
      detail: bristolEvents(events).length > 0 ? "There's older data on this page, but not enough logged in the last 30 days to say anything current." : null,
      tone: "neutral",
      changed: [],
    };
  }

  const recentRounded = Math.round(rangeChange.recentPct!);
  const priorRounded = rangeChange.priorPct !== null ? Math.round(rangeChange.priorPct) : null;
  const headline =
    priorRounded !== null
      ? `Bristol 3–4 made up ${recentRounded}% of recorded stools in the last 30 days, compared with ${priorRounded}% in the previous 30 days.`
      : `Bristol 3–4 made up ${recentRounded}% of recorded stools in the last 30 days.`;
  const detail =
    priorRounded !== null && Math.abs(recentRounded - priorRounded) >= TARGET_RANGE_NOTABLE_DIFF_PP
      ? `That's a ${recentRounded > priorRounded ? "higher" : "lower"} share of your stools in the target range than the previous 30 days.`
      : null;
  const tone: InsightTone = "neutral";

  const changed: Bullet[] = [];

  const span = getDatasetSpan(events);
  if (!span) return { insufficientData: false, headline, detail, tone, changed };

  const windowStart = addDaysToDate(span.end, -(RECENT_WINDOW_DAYS - 1));
  const recentEvents = events.filter((e) => e.date >= windowStart);
  const recentClassifiedCount = bristolBandDistribution(recentEvents).reduce((s, b) => s + b.count, 0);

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
