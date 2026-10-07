import type { CanonicalEvent, RawPeriodLog, RawStoolLog, RawWorkoutLog } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";
import type { CheckIn } from "@/lib/supabase/checkins";
import {
  addDaysToDate,
  pct,
  round1,
  FOOD_GAP_DAYS,
  SECTION_GAP_DAYS,
  sectionTrackedDates,
  symptomTrackedDates,
  trackedCalendarDates,
  trackedDatesForType,
} from "./common";
import { cyclePhaseByDate, groupIntoPeriodRuns, type CyclePhase } from "./cycle";
import { bristolAssessedDates, bristolTypeDates } from "./digestion";
import { foodCategoryDistribution, rankedFoods } from "./food";
import { supplementStats } from "./supplements";
import { habitStats } from "./habits";
import { workoutTrainedDates } from "./workout";

export interface ItemMatcher {
  label: string;
  /** Matches either a specific canonical item name or a whole category. */
  test: (e: CanonicalEvent) => boolean;
}

export function matchItem(item: string): ItemMatcher {
  return { label: item, test: (e) => e.item === item && e.completed };
}

export function matchCategory(category: string): ItemMatcher {
  return { label: category, test: (e) => e.category === category && e.completed };
}

function dateSetForMatcher(events: CanonicalEvent[], matcher: ItemMatcher): Set<string> {
  return new Set(events.filter(matcher.test).map((e) => e.date));
}

/** Earliest logged time (epoch ms) per date for the matching entries. */
function firstTimeByDate(events: CanonicalEvent[], matcher: ItemMatcher): Map<string, number> {
  const times = new Map<string, number>();
  for (const e of events) {
    if (!matcher.test(e) || !e.updatedAt) continue;
    const t = Date.parse(e.updatedAt);
    if (Number.isNaN(t)) continue;
    const prev = times.get(e.date);
    if (prev === undefined || t < prev) times.set(e.date, t);
  }
  return times;
}

/** The section's tracked days that fall inside one item's own window: from
 * its first entry, and — when `tailDays` is given — up to that many days
 * past its last. Before a symptom was ever logged, or outside a
 * supplement's course, "not logged" says nothing. */
function withinItemWindow(sectionTracked: Set<string>, itemDates: Set<string>, tailDays?: number): Set<string> {
  if (itemDates.size === 0) return new Set();
  const sorted = Array.from(itemDates).sort();
  const first = sorted[0];
  const last = tailDays === undefined ? null : addDaysToDate(sorted[sorted.length - 1], tailDays);
  return new Set(Array.from(sectionTracked).filter((d) => d >= first && (last === null || d <= last)));
}

/** Days a symptom's absence means it didn't happen: symptom logging was
 * active and the symptom had been logged at least once before. */
function outcomeTracked(events: CanonicalEvent[], outcomeDates: Set<string>, symptomTracked = symptomTrackedDates(events)): Set<string> {
  return withinItemWindow(symptomTracked, outcomeDates);
}

/** A link with either side at or below this share is almost always a
 * coverage artefact (one side fell where the symptom wasn't being logged). */
const MIN_SIDE_PCT = 2;

/** True when neither side of a comparison is near zero. */
export function bothSidesObserved(assoc: AssociationResult): boolean {
  return assoc.withPct > MIN_SIDE_PCT && assoc.withoutPct > MIN_SIDE_PCT;
}

export interface AssociationResult {
  causeLabel: string;
  outcomeLabel: string;
  lagDays: number;
  withCount: number;
  withTotal: number;
  withPct: number;
  withoutCount: number;
  withoutTotal: number;
  withoutPct: number;
  /** Percentage-point difference, with-minus-without. Positive = more common alongside the cause. */
  diffPct: number;
  sampleTier: SampleTier;
  /** Tested within each cycle phase, so the phase can't explain it. */
  phaseAdjusted?: boolean;
}

export type SampleTier = "insufficient" | "exploratory" | "moderate" | "strong";

/**
 * Tiers by exposed-day sample size (the harder-to-satisfy side in practice),
 * with a floor on the unexposed side so the comparison itself is meaningful.
 * Thresholds are deliberately conservative for a single-subject dataset:
 * even "strong" here means "stable within this person's own data," not
 * statistically powered in the population-research sense.
 */
function sampleTier(withTotal: number, withoutTotal: number): SampleTier {
  if (withTotal < 10 || withoutTotal < 5) return "insufficient";
  if (withTotal < 20) return "exploratory";
  if (withTotal < 30) return "moderate";
  return "strong";
}

/**
 * The core comparison, working purely on date sets: of the days we know
 * whether the outcome happened, how often did it happen on days the cause
 * was also true, vs days it wasn't? `lagDays` shifts the cause date
 * backward relative to the outcome date (lagDays=1 means "cause yesterday
 * -> outcome today"). Descriptive (non-causal) only.
 *
 * Deliberately takes plain `Set<string>` dates rather than `ItemMatcher`s —
 * that's what lets every kind of cause/outcome (a specific item, a Bristol
 * type-group, a workout-trained day, a sleep-duration threshold, an ingredient
 * pair) share this one statistical implementation instead of each
 * reimplementing sample-tiering/lag math on its own.
 */
export interface AssociationOptions {
  /** Days the cause's own section was tracked; a cause date outside it is
   * neither "with" nor "without" and is skipped. */
  causeTrackedDates?: Set<string>;
  /** Earliest time per date of the cause and of the outcome. At lag 0 a
   * day where the cause was logged after the outcome is skipped — it
   * can't have come first. */
  causeTimes?: Map<string, number>;
  outcomeTimes?: Map<string, number>;
}

interface ComparedDay {
  outcomeDate: string;
  hadCause: boolean;
  occurred: boolean;
}

/** Every outcome-tracked day the comparison can use, with whether the
 * cause (shifted by the lag) and the outcome happened. */
function compareDays(
  causeDates: Set<string>,
  outcomeOccurredDates: Set<string>,
  outcomeTrackedDates: Set<string>,
  lagDays: number,
  options: AssociationOptions = {},
): ComparedDay[] {
  const { causeTrackedDates, causeTimes, outcomeTimes } = options;
  const days: ComparedDay[] = [];
  for (const outcomeDate of outcomeTrackedDates) {
    const causeDate = addDaysToDate(outcomeDate, -lagDays);
    if (causeTrackedDates && !causeTrackedDates.has(causeDate)) continue;
    const hadCause = causeDates.has(causeDate);
    const occurred = outcomeOccurredDates.has(outcomeDate);
    if (lagDays === 0 && hadCause && occurred && causeTimes && outcomeTimes) {
      const causeAt = causeTimes.get(causeDate);
      const outcomeAt = outcomeTimes.get(outcomeDate);
      if (causeAt !== undefined && outcomeAt !== undefined && causeAt > outcomeAt) continue;
    }
    days.push({ outcomeDate, hadCause, occurred });
  }
  return days;
}

/** A 2×2 table as [with & occurred, with & not, without & occurred, without & not]. */
type Table = [number, number, number, number];

function tally(days: ComparedDay[]): Table {
  const t: Table = [0, 0, 0, 0];
  for (const d of days) t[(d.hadCause ? 0 : 2) + (d.occurred ? 0 : 1)]++;
  return t;
}

export function computeAssociationFromDateSets(
  causeDates: Set<string>,
  outcomeOccurredDates: Set<string>,
  outcomeTrackedDates: Set<string>,
  lagDays: number,
  causeLabel: string,
  outcomeLabel: string,
  options: AssociationOptions = {},
): AssociationResult {
  const days = compareDays(causeDates, outcomeOccurredDates, outcomeTrackedDates, lagDays, options);
  return associationFromTable(tally(days), lagDays, causeLabel, outcomeLabel);
}

function associationFromTable([a, b, c, d]: Table, lagDays: number, causeLabel: string, outcomeLabel: string): AssociationResult {
  const withTotal = a + b;
  const withoutTotal = c + d;
  const withPct = pct(a, withTotal);
  const withoutPct = pct(c, withoutTotal);
  return {
    causeLabel,
    outcomeLabel,
    lagDays,
    withCount: a,
    withTotal,
    withPct,
    withoutCount: c,
    withoutTotal,
    withoutPct,
    diffPct: round1(withPct - withoutPct),
    sampleTier: sampleTier(withTotal, withoutTotal),
  };
}

/** Something Patterns looks for links to: a logged symptom, or low mood /
 * low energy from the daily check-in. */
export interface OutcomeOption {
  label: string;
  /** Symptom category — decides which delays are plausible. */
  category: string;
  dates: Set<string>;
  /** Days we know whether it happened. */
  tracked: Set<string>;
  times?: Map<string, number>;
  /** Highest logged intensity (1–3) per date, for symptoms. */
  levels?: Map<string, number>;
}

/** A check-in at or below this counts as low. */
const LOW_CHECKIN_LEVEL = 2;

/** "Low mood" and "Low energy", each known only on days that field was checked in. */
export function checkInOutcomes(checkIns: CheckIn[]): OutcomeOption[] {
  const outcome = (label: string, pick: (c: CheckIn) => number | null): OutcomeOption => {
    const rated = checkIns.filter((c) => pick(c) != null);
    return {
      label,
      category: "Mood",
      dates: new Set(rated.filter((c) => pick(c)! <= LOW_CHECKIN_LEVEL).map((c) => c.date)),
      tracked: new Set(rated.map((c) => c.date)),
    };
  };
  return [outcome("Low mood", (c) => c.mood), outcome("Low energy", (c) => c.energy)].filter((o) => o.tracked.size > 0);
}

/** Hard (Bristol 1–2) and loose (5–7) stools, out of the days any bowel
 * movement was logged. */
export function stoolOutcomes(stoolLogs: RawStoolLog[]): OutcomeOption[] {
  const tracked = bristolAssessedDates(stoolLogs);
  if (tracked.size === 0) return [];
  const outcome = (label: string, scores: number[]): OutcomeOption => {
    const dates = bristolTypeDates(stoolLogs, scores);
    const times = new Map<string, number>();
    for (const s of stoolLogs) {
      const t = Date.parse(s.loggedAt);
      if (Number.isNaN(t) || !s.bristolScores.some((sc) => scores.includes(sc))) continue;
      const prev = times.get(s.date);
      if (prev === undefined || t < prev) times.set(s.date, t);
    }
    return { label, category: "Stool", dates, tracked, times };
  };
  return [outcome("Hard stool", [1, 2]), outcome("Loose stool", [5, 6, 7])];
}

/** Every outcome Patterns tests: each logged symptom, the check-in ones and hard or loose stools. */
export function patternOutcomes(events: CanonicalEvent[], checkIns: CheckIn[] = [], stoolLogs: RawStoolLog[] = []): OutcomeOption[] {
  const categories = new Map<string, string>();
  for (const e of events) if (e.itemType === "outcome" && !categories.has(e.item)) categories.set(e.item, e.category);
  const symptomTracked = symptomTrackedDates(events);
  const symptoms = Array.from(categories, ([label, category]) => {
    const matcher = matchItem(label);
    const dates = dateSetForMatcher(events, matcher);
    const levels = new Map<string, number>();
    for (const e of events) {
      if (!matcher.test(e) || e.value == null) continue;
      levels.set(e.date, Math.max(levels.get(e.date) ?? 0, Math.min(3, e.value)));
    }
    return { label, category, dates, tracked: outcomeTracked(events, dates, symptomTracked), times: firstTimeByDate(events, matcher), levels };
  });
  return [...symptoms, ...checkInOutcomes(checkIns), ...stoolOutcomes(stoolLogs)];
}

export function computeLaggedAssociations(cause: CauseOption, outcome: OutcomeOption, lags: number[] = [0, 1, 2, 3]): AssociationResult[] {
  return lags.map((lag) =>
    computeAssociationFromDateSets(cause.dates, outcome.dates, outcome.tracked, lag, cause.label, outcome.label, {
      causeTrackedDates: cause.tracked,
      causeTimes: cause.times,
      outcomeTimes: outcome.times,
    }),
  );
}

function findLink(
  events: CanonicalEvent[],
  causeLabel: string,
  outcomeLabel: string,
  periodLogs: RawPeriodLog[],
  checkIns: CheckIn[],
  stoolLogs: RawStoolLog[],
): { cause: CauseOption; outcome: OutcomeOption } | null {
  const cause = patternCauses(events, periodLogs).find((c) => c.label === causeLabel);
  const outcome = patternOutcomes(events, checkIns, stoolLogs).find((o) => o.label === outcomeLabel);
  return cause && outcome ? { cause, outcome } : null;
}

/** One link's comparison at every delay from the same day to 3 days after. */
export function linkByDelay(
  events: CanonicalEvent[],
  causeLabel: string,
  outcomeLabel: string,
  periodLogs: RawPeriodLog[] = [],
  checkIns: CheckIn[] = [],
  stoolLogs: RawStoolLog[] = [],
): AssociationResult[] {
  const link = findLink(events, causeLabel, outcomeLabel, periodLogs, checkIns, stoolLogs);
  return link ? computeLaggedAssociations(link.cause, link.outcome) : [];
}

export interface IntensityComparison {
  /** Average 1–3 on the days the symptom happened, with and without the trigger. */
  withAvg: number;
  withDays: number;
  withoutAvg: number;
  withoutDays: number;
}

/** Fewer symptom days than this on either side and an average says nothing. */
const MIN_INTENSITY_DAYS = 3;

/** How strong the symptom was when it happened, with the trigger vs
 * without, at the link's delay. Null for outcomes without a level (mood,
 * stool), a symptom only ever logged at one level, or too few days. */
export function linkIntensity(
  events: CanonicalEvent[],
  link: AssociationResult,
  periodLogs: RawPeriodLog[] = [],
  checkIns: CheckIn[] = [],
  stoolLogs: RawStoolLog[] = [],
): IntensityComparison | null {
  const found = findLink(events, link.causeLabel, link.outcomeLabel, periodLogs, checkIns, stoolLogs);
  const levels = found?.outcome.levels;
  if (!found || !levels || new Set(levels.values()).size < 2) return null;
  const { cause, outcome } = found;
  const days = compareDays(cause.dates, outcome.dates, outcome.tracked, link.lagDays, {
    causeTrackedDates: cause.tracked,
    causeTimes: cause.times,
    outcomeTimes: outcome.times,
  });
  const side = (hadCause: boolean) => days.flatMap((d) => (d.occurred && d.hadCause === hadCause && levels.has(d.outcomeDate) ? [levels.get(d.outcomeDate)!] : []));
  const withLevels = side(true);
  const withoutLevels = side(false);
  if (withLevels.length < MIN_INTENSITY_DAYS || withoutLevels.length < MIN_INTENSITY_DAYS) return null;
  const avg = (v: number[]) => round1(v.reduce((a, b) => a + b, 0) / v.length);
  return { withAvg: avg(withLevels), withDays: withLevels.length, withoutAvg: avg(withoutLevels), withoutDays: withoutLevels.length };
}

export const MIN_INTERESTING_DIFF_PCT = 15;
const TOP_CANDIDATE_FOODS = 12;

/**
 * Supplement categories excluded from the cause-candidate pool:
 *  - Medication / Digestive Aid: taken PRN, in response to the symptom
 *    itself (Paracetamol for a headache, Gaviscon for reflux, Espumisan
 *    for gas). Any "association" with that symptom is a near-guaranteed
 *    reverse-causation artifact, not a finding — the medication doesn't
 *    predict the symptom, the symptom predicts the medication.
 *  - Creams: applied topically, with no plausible route to a digestive or
 *    systemic symptom. A correlation here is small-sample noise, not signal.
 */
const EXCLUDED_CAUSE_SUPPLEMENT_CATEGORIES = new Set(["Medication", "Digestive Aid", "Creams"]);

/**
 * Every habit is an eligible cause candidate — no category allowlist. This
 * is also what makes a habit someone creates tomorrow automatically usable
 * by the analytics engine with no special-casing: it's just one more row
 * `habitStats` returns.
 */
function habitCauseCandidates(events: CanonicalEvent[]): ItemMatcher[] {
  return habitStats(events).map((h) => matchItem(h.item));
}

/**
 * Full cause-candidate pool for the Lag Explorer's dropdown: top-tracked
 * foods and food categories, non-reactive supplements, every tracked habit,
 * and (when workout data exists) whether a workout session happened that day — so
 * "is exercise related to symptoms at all?" is answerable in the UI, not
 * just in this module.
 */
export interface CauseOption {
  label: string;
  dates: Set<string>;
  /** Days the cause's section was tracked — only these count as "without". */
  tracked: Set<string>;
  /** Earliest logged time per date, for same-day ordering. */
  times?: Map<string, number>;
}

/** Builds cause options for one item type: each is tracked on its
 * section's tracked days within its own first-to-last-entry window. */
function causesForType(events: CanonicalEvent[], itemType: ItemType) {
  const sectionTracked = trackedDatesForType(events, itemType, itemType === "food" ? FOOD_GAP_DAYS : SECTION_GAP_DAYS);
  return (label: string, matcher: ItemMatcher): CauseOption => {
    const dates = dateSetForMatcher(events, matcher);
    return { label, dates, tracked: withinItemWindow(sectionTracked, dates, SECTION_GAP_DAYS), times: firstTimeByDate(events, matcher) };
  };
}

function workoutCause(events: CanonicalEvent[], workoutLogs: RawWorkoutLog[]): CauseOption[] {
  if (workoutLogs.length === 0) return [];
  const dates = workoutTrainedDates(workoutLogs);
  return [{ label: "Workout: trained that day", dates, tracked: sectionTrackedDates(dates, trackedCalendarDates(events)) }];
}

/** One cause per cycle phase, over the days inside completed cycles. */
function cyclePhaseCauses(periodLogs: RawPeriodLog[], phases = cyclePhaseByDate(groupIntoPeriodRuns(periodLogs))): CauseOption[] {
  if (phases.size === 0) return [];
  const tracked = new Set(phases.keys());
  const byPhase = new Map<CyclePhase, Set<string>>();
  for (const [date, phase] of phases) {
    const set = byPhase.get(phase) ?? new Set<string>();
    set.add(date);
    byPhase.set(phase, set);
  }
  return Array.from(byPhase, ([phase, dates]) => ({ label: `${phase} phase`, dates, tracked }));
}

export function allCauseOptions(events: CanonicalEvent[], workoutLogs: RawWorkoutLog[] = [], periodLogs: RawPeriodLog[] = []): CauseOption[] {
  const food = causesForType(events, "food");
  const supplement = causesForType(events, "supplement");
  const habit = causesForType(events, "habit");
  const foods = rankedFoods(events).map((f) => food(`Food: ${f.item}`, matchItem(f.item)));
  const categories = foodCategoryDistribution(events)
    .filter((c) => c.count > 0)
    .map((c) => food(`Food category: ${c.category}`, matchCategory(c.category)));
  const supplements = supplementStats(events).map((s) => supplement(`Supplement: ${s.item}`, matchItem(s.item)));
  const habits = habitCauseCandidates(events).map((m) => habit(`Habit: ${m.label}`, m));
  const phases = cyclePhaseCauses(periodLogs).map((c) => ({ ...c, label: `Cycle: ${c.label}` }));
  return [...foods, ...categories, ...supplements, ...habits, ...workoutCause(events, workoutLogs), ...phases];
}

/** Top-tracked foods and non-reactive supplements, by their plain names. */
function foodAndSupplementCauses(events: CanonicalEvent[]): CauseOption[] {
  const food = causesForType(events, "food");
  const supplement = causesForType(events, "supplement");
  return [
    ...rankedFoods(events)
      .slice(0, TOP_CANDIDATE_FOODS)
      .map((f) => food(f.item, matchItem(f.item))),
    ...supplementStats(events)
      .filter((s) => !EXCLUDED_CAUSE_SUPPLEMENT_CATEGORIES.has(s.category))
      .map((s) => supplement(s.item, matchItem(s.item))),
  ];
}

/** The Patterns tab's trigger pool: foods, supplements and cycle phases. */
export function patternCauses(events: CanonicalEvent[], periodLogs: RawPeriodLog[] = []): CauseOption[] {
  return [...foodAndSupplementCauses(events), ...cyclePhaseCauses(periodLogs)];
}

/** Days needed on each side (with the trigger, and without it) before a
 * comparison is tested at all — below this the "without" group is a
 * handful of days and any gap is noise. */
const MIN_CONTRAST_DAYS = 14;
/** A trigger present on nearly every day (or nearly none) leaves nothing
 * to compare against, so its share of days must fall in this band. */
const MIN_EXPOSED_SHARE = 0.15;
const MAX_EXPOSED_SHARE = 0.85;
/** Benjamini–Hochberg false-discovery rate a link has to survive. */
const MAX_FALSE_DISCOVERY_RATE = 0.1;
const MAX_LINKS = 5;

/** Which day offsets are plausible for a symptom, by its category: gut
 * symptoms can trail a food by a couple of days, pain by a day, tiredness
 * and mood only the same day; menstrual symptoms follow the cycle by
 * definition, so they're not tested. A cycle phase is a same-day cause. */
export function plausibleLags(category: string, causeLabel = ""): number[] {
  if (causeLabel.endsWith(" phase")) return category.toLowerCase().includes("menstrual") ? [] : [0];
  const c = category.toLowerCase();
  if (c.includes("menstrual")) return [];
  if (c.includes("digest") || c.includes("stool")) return [0, 1, 2];
  if (c.includes("pain") || c.includes("headache")) return [0, 1];
  return [0];
}

const logFactorials: number[] = [0];
function logFactorial(n: number): number {
  for (let i = logFactorials.length; i <= n; i++) logFactorials[i] = logFactorials[i - 1] + Math.log(i);
  return logFactorials[n];
}

/** Two-sided Fisher's exact test p-value for a 2×2 table
 * [[a, b], [c, d]] — exact at the small counts a personal log has. */
export function fisherExactP(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const col1 = a + c;
  const n = a + b + c + d;
  const logP = (x: number) =>
    logFactorial(row1) + logFactorial(n - row1) + logFactorial(col1) + logFactorial(n - col1) -
    logFactorial(n) - logFactorial(x) - logFactorial(row1 - x) - logFactorial(col1 - x) - logFactorial(n - row1 - col1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, row1 + col1 - n); x <= Math.min(row1, col1); x++) {
    const lp = logP(x);
    if (lp <= observed + 1e-7) p += Math.exp(lp);
  }
  return Math.min(1, p);
}

/** Complementary error function (Numerical Recipes' erfcc, error < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Cochran–Mantel–Haenszel test across 2×2 tables, one per stratum
 * (continuity-corrected, 1 df). `excess` is observed minus expected
 * "with & occurred" days summed over strata: positive means the outcome
 * is more common with the cause within strata. Strata where one margin
 * is empty carry no information and drop out. */
export function mantelHaenszelP(tables: Table[]): { p: number; excess: number; strata: number } {
  let excess = 0;
  let variance = 0;
  let strata = 0;
  for (const [a, b, c, d] of tables) {
    const n = a + b + c + d;
    const row1 = a + b;
    const col1 = a + c;
    if (n < 2 || row1 === 0 || row1 === n || col1 === 0 || col1 === n) continue;
    excess += a - (row1 * col1) / n;
    variance += (row1 * (n - row1) * col1 * (n - col1)) / (n * n * (n - 1));
    strata++;
  }
  if (variance === 0) return { p: 1, excess, strata };
  const chi2 = Math.max(0, Math.abs(excess) - 0.5) ** 2 / variance;
  return { p: erfc(Math.sqrt(chi2 / 2)), excess, strata };
}

/** Key for a symptom × trigger pair, for matching one against the hidden ones. */
export function patternLinkKey(outcomeLabel: string, causeLabel: string): string {
  return `${outcomeLabel}\u0000${causeLabel}`;
}

/**
 * The Patterns tab's links: for every symptom × food/supplement/cycle
 * phase × plausible lag with enough days on both sides, a Fisher's exact
 * test — or, once cycle phases are known, a Mantel–Haenszel test within
 * each phase for foods and supplements. Only days both the symptom's and
 * the trigger's sections were really tracked are compared, and a link with
 * either side near 0% is dropped as a coverage artefact. The p-values of
 * every test run are then corrected together (Benjamini–Hochberg), and
 * only links that survive — at most one lag per pair, strongest first,
 * capped at five — are returned. Habits and routines aren't tested as
 * triggers, nor medicines taken in response to symptoms. Pairs in
 * `hidden` (the user marked them not related) are skipped.
 */
export function generateTopPatterns(
  events: CanonicalEvent[],
  hidden: ReadonlySet<string> = new Set(),
  periodLogs: RawPeriodLog[] = [],
  checkIns: CheckIn[] = [],
  stoolLogs: RawStoolLog[] = [],
): AssociationResult[] {
  const outcomes = patternOutcomes(events, checkIns, stoolLogs);
  if (outcomes.length === 0) return [];

  const phases = cyclePhaseByDate(groupIntoPeriodRuns(periodLogs));
  const causes = [...foodAndSupplementCauses(events), ...cyclePhaseCauses(periodLogs, phases)];

  const tests: { assoc: AssociationResult; p: number }[] = [];
  for (const outcome of outcomes) {
    for (const cause of causes) {
      if (cause.label === outcome.label || hidden.has(patternLinkKey(outcome.label, cause.label))) continue;
      const stratify = phases.size > 0 && !cause.label.endsWith(" phase");
      for (const lag of plausibleLags(outcome.category, cause.label)) {
        const days = compareDays(cause.dates, outcome.dates, outcome.tracked, lag, {
          causeTrackedDates: cause.tracked,
          causeTimes: cause.times,
          outcomeTimes: outcome.times,
        });
        const table = tally(days);
        const assoc = associationFromTable(table, lag, cause.label, outcome.label);
        if (assoc.withTotal < MIN_CONTRAST_DAYS || assoc.withoutTotal < MIN_CONTRAST_DAYS) continue;
        if (!bothSidesObserved(assoc)) continue;
        const exposedShare = assoc.withTotal / (assoc.withTotal + assoc.withoutTotal);
        if (exposedShare < MIN_EXPOSED_SHARE || exposedShare > MAX_EXPOSED_SHARE) continue;
        if (stratify) {
          // Compare within each cycle phase (days outside a completed cycle
          // form their own group) so a food eaten more in one phase can't
          // borrow that phase's symptoms.
          const byPhase = new Map<string, ComparedDay[]>();
          for (const d of days) {
            const key = phases.get(d.outcomeDate) ?? "";
            byPhase.set(key, [...(byPhase.get(key) ?? []), d]);
          }
          const mh = mantelHaenszelP(Array.from(byPhase.values(), tally));
          if (mh.strata >= 2) {
            // Within phases the link must point the same way as overall.
            if (Math.sign(mh.excess) !== Math.sign(assoc.diffPct)) continue;
            tests.push({ assoc: { ...assoc, phaseAdjusted: true }, p: mh.p });
            continue;
          }
        }
        tests.push({ assoc, p: fisherExactP(...table) });
      }
    }
  }
  if (tests.length === 0) return [];

  // Benjamini–Hochberg: the largest rank k with p(k) <= k/m * q, and
  // everything at or below it passes.
  const ranked = [...tests].sort((x, y) => x.p - y.p);
  let cutoff = -1;
  ranked.forEach((t, i) => {
    if (t.p <= ((i + 1) / ranked.length) * MAX_FALSE_DISCOVERY_RATE) cutoff = i;
  });
  const surviving = ranked.slice(0, cutoff + 1).filter((t) => Math.abs(t.assoc.diffPct) >= MIN_INTERESTING_DIFF_PCT);

  const bestPerPair = new Map<string, { assoc: AssociationResult; p: number }>();
  for (const t of surviving) {
    const key = patternLinkKey(t.assoc.outcomeLabel, t.assoc.causeLabel);
    const prev = bestPerPair.get(key);
    if (!prev || t.p < prev.p) bestPerPair.set(key, t);
  }
  return [...bestPerPair.values()]
    .sort((x, y) => x.p - y.p)
    .slice(0, MAX_LINKS)
    .map((t) => t.assoc);
}
