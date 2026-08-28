import type { CanonicalEvent, RawStoolLog } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, isoWeekStart, monthStart, pct, round1, trackedCalendarDates } from "./common";
import { computeItemStatsForFilter, type ItemStats } from "./itemStats";
import type { Bullet, InsightTone } from "./insights";

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

export type BristolBand = "Hard (1–2)" | "Normal (3–4)" | "Loose (5–7)";

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
 * Last-30-days vs previous-30-days share of entries in the 3–4 target
 * band — the quantified "how often am I actually in my desired range, and
 * is that changing" comparison the hero insight and the target-range stat
 * tile are built from.
 */
export function bristolTargetRangeChange(stoolLogs: RawStoolLog[]): BristolTargetRangeChange {
  if (stoolLogs.length === 0) {
    return { insufficientData: true, recentPct: null, recentTotal: 0, priorPct: null, priorTotal: 0 };
  }
  const lastDate = stoolLogs.reduce((max, s) => (s.date > max ? s.date : max), stoolLogs[0].date);
  const recentStart = addDaysToDate(lastDate, -(TARGET_RANGE_WINDOW_DAYS - 1));
  const priorEnd = addDaysToDate(recentStart, -1);
  const priorStart = addDaysToDate(priorEnd, -(TARGET_RANGE_WINDOW_DAYS - 1));

  const recent = stoolLogs.filter((s) => s.date >= recentStart && s.date <= lastDate);
  const prior = stoolLogs.filter((s) => s.date >= priorStart && s.date <= priorEnd);

  if (recent.length < MIN_WINDOW_ENTRIES) {
    return { insufficientData: true, recentPct: null, recentTotal: recent.length, priorPct: null, priorTotal: prior.length };
  }

  // Denominator is every logged entry (matches the headline's "share of
  // recorded stools" framing). An entry with more than one score counts
  // toward the numerator if any one of them lands in the target band.
  const shareInTarget = (list: RawStoolLog[]) =>
    pct(list.filter((s) => s.bristolScores.some((sc) => bandForScore(sc) === "Normal (3–4)")).length, list.length);

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

export interface BristolMonthlyAveragePoint {
  monthStart: string;
  avgScore: number;
  count: number;
}

/**
 * Monthly average Bristol score — used in place of `bristolScoreSeries`
 * only once a selected range is long enough (roughly 4+ months) that
 * plotting every individual observation would be an unreadable wall of
 * points.
 */
export function bristolMonthlyScoreAverage(stoolLogs: RawStoolLog[]): BristolMonthlyAveragePoint[] {
  const scored = flattenedBristolScores(stoolLogs).map((s) => ({ month: monthStart(s.date), value: s.score }));

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

export interface StoolCharacteristicCount {
  label: string;
  count: number;
  sharePct: number;
}

const CHARACTERISTIC_TESTS: [string, (s: RawStoolLog) => boolean][] = [
  ["Sticky", (s) => s.isSticky],
  ["Smelly", (s) => s.isSmelly],
  ["Straining", (s) => s.isStraining],
];

/** How often each stool property (sticky, smelly, straining) showed up, out
 * of every logged entry — plain boolean columns on `stool_logs`. Symptoms
 * tied to the movement are counted separately (`stoolSymptomStats`). */
export function stoolCharacteristicStats(stoolLogs: RawStoolLog[]): StoolCharacteristicCount[] {
  const total = stoolLogs.length;
  if (total === 0) return [];
  return CHARACTERISTIC_TESTS.map(([label, test]) => {
    const count = stoolLogs.filter(test).length;
    return { label, count, sharePct: pct(count, total) };
  })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** How often each movement-level symptom (urgency, mucus, cramps, …) was
 * logged, out of every entry. */
export function stoolSymptomStats(stoolLogs: RawStoolLog[]): StoolCharacteristicCount[] {
  const total = stoolLogs.length;
  if (total === 0) return [];
  const counts = new Map<string, number>();
  for (const s of stoolLogs) for (const sym of s.symptoms) counts.set(sym, (counts.get(sym) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, sharePct: pct(count, total) }))
    .sort((a, b) => b.count - a.count);
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
   * pattern is good or bad. Bristol banding has an established clinical
   * reading, but Lauva doesn't apply it as a verdict on a person's own
   * data; kept as a field for consistency with other pages' Insight usage,
   * not because a value judgment is ever made here. */
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
 * quantified last-30-days-vs-previous-30-days share of entries in the 3–4
 * target range (the actual question this page exists to answer — "how
 * often am I in my desired range, and is that changing"), then adds
 * digestive-symptom-frequency drift as a supporting bullet. Never a
 * diagnosis — describes what was logged, not what it means medically (no
 * "constipation", "IBS", etc.).
 */
export function digestionInsight(events: CanonicalEvent[], stoolLogs: RawStoolLog[]): DigestionInsight {
  const rangeChange = bristolTargetRangeChange(stoolLogs);
  if (rangeChange.insufficientData) {
    return {
      insufficientData: true,
      headline: "Not enough recent observations to identify a stable pattern.",
      detail: stoolLogs.length > 0 ? "There's older data on this page, but not enough logged in the last 30 days to say anything current." : null,
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

  const trackedDates = Array.from(trackedCalendarDates(events)).sort();
  const recentTrackedDates = trackedDates.filter((d) => d >= windowStart);
  if (trackedDates.length >= MIN_TRACKED_DAYS_FOR_SYMPTOM_COMPARE && recentTrackedDates.length >= 5) {
    const recentEvents = events.filter((e) => e.date >= windowStart);
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

  return { insufficientData: false, headline, detail, tone, changed };
}
