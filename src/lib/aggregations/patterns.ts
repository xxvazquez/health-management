import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, pct, trackedCalendarDates } from "./common";
import { foodCategoryDistribution, newFoodsOverTime, rankedFoods } from "./food";
import { supplementStats } from "./supplements";
import { habitStats } from "./habits";

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

/**
 * Which dates count as "we know whether this outcome happened" for a given
 * outcome item. For a consistent logger, absence on a day the app was
 * otherwise in use means the outcome didn't happen — so this defaults to
 * every globally-active date. The one exception is the Bristol scale: it's
 * a mutually-exclusive multi-pick (Bristol 1–5 / No Bristol), so a missing
 * entry can't be resolved to any single one of those six values and is
 * left as genuinely unknown, using only the dates that item was logged.
 */
export function outcomeTrackedDates(events: CanonicalEvent[], item: string): Set<string> {
  const isBristolScale = events.some((e) => e.item === item && e.subcategory === "Bristol Scale");
  if (isBristolScale) {
    return new Set(events.filter((e) => e.item === item).map((e) => e.date));
  }
  return trackedCalendarDates(events);
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
  /** @deprecated use `sampleTier !== "insufficient"` — kept for callers that only need a boolean gate. */
  sampleSizeAdequate: boolean;
}

export type SampleTier = "insufficient" | "exploratory" | "moderate" | "strong";

export const SAMPLE_TIER_LABEL: Record<SampleTier, string> = {
  insufficient: "Insufficient data",
  exploratory: "Exploratory",
  moderate: "Moderate confidence",
  strong: "Stronger descriptive evidence",
};

export const SAMPLE_TIER_EXPLANATION: Record<SampleTier, string> = {
  insufficient: "Fewer than 10 exposed days (or fewer than 5 unexposed days) tracked — not shown as a finding.",
  exploratory: "10–19 exposed days tracked. Worth noting, but easily wrong by chance — treat as a hypothesis, not a finding.",
  moderate: "20–29 exposed days tracked. A more stable comparison, still purely descriptive.",
  strong: "30+ exposed days tracked. The most stable comparisons this app can produce — still not evidence of causation.",
};

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
 * Descriptive (non-causal) co-occurrence: of the days we know whether the
 * outcome happened, how often did it happen on days the cause was also
 * tracked+completed, vs days it wasn't? `lagDays` shifts the cause date
 * backward relative to the outcome date (lagDays=1 means "cause yesterday
 * -> outcome today").
 */
export function computeAssociation(
  events: CanonicalEvent[],
  cause: ItemMatcher,
  outcomeCompleted: ItemMatcher,
  outcomeTrackedSet: Set<string>,
  lagDays = 0,
): AssociationResult {
  const causeDatesCompleted = new Set(events.filter(cause.test).map((e) => e.date));
  const outcomeCompletedDates = new Set(events.filter(outcomeCompleted.test).map((e) => e.date));

  let withCount = 0;
  let withTotal = 0;
  let withoutCount = 0;
  let withoutTotal = 0;

  for (const outcomeDate of outcomeTrackedSet) {
    const causeDate = addDaysToDate(outcomeDate, -lagDays);
    const hadCause = causeDatesCompleted.has(causeDate);
    const occurred = outcomeCompletedDates.has(outcomeDate);
    if (hadCause) {
      withTotal++;
      if (occurred) withCount++;
    } else {
      withoutTotal++;
      if (occurred) withoutCount++;
    }
  }

  const withPct = pct(withCount, withTotal);
  const withoutPct = pct(withoutCount, withoutTotal);

  return {
    causeLabel: cause.label,
    outcomeLabel: outcomeCompleted.label,
    lagDays,
    withCount,
    withTotal,
    withPct,
    withoutCount,
    withoutTotal,
    withoutPct,
    diffPct: Math.round((withPct - withoutPct) * 10) / 10,
    sampleTier: sampleTier(withTotal, withoutTotal),
    sampleSizeAdequate: sampleTier(withTotal, withoutTotal) !== "insufficient",
  };
}

export function computeLaggedAssociations(
  events: CanonicalEvent[],
  cause: ItemMatcher,
  outcome: ItemMatcher,
  lags: number[] = [0, 1, 2, 3],
): AssociationResult[] {
  const trackedSet = outcomeTrackedDates(events, outcome.label);
  return lags.map((lag) => computeAssociation(events, cause, outcome, trackedSet, lag));
}

export const MIN_INTERESTING_DIFF_PCT = 15;
const MAX_TOP_PATTERNS = 15;
const TOP_CANDIDATE_FOODS = 12;
/**
 * Digestive symptoms don't necessarily show up same-day — with slower
 * motility a symptom can lag the food/supplement that (maybe) relates to
 * it by a day or more. So each cause/outcome pair is scanned across these
 * lags and the strongest signal is what surfaces, rather than only ever
 * checking same-day.
 */
const SCAN_LAGS = [0, 1, 2, 3];

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

/** Habit categories with a plausible physiological route to digestive/other symptoms — kept narrow on purpose. */
const INCLUDED_CAUSE_HABIT_CATEGORIES = new Set(["Exercise", "Movement"]);

function habitCauseCandidates(events: CanonicalEvent[]): ItemMatcher[] {
  return habitStats(events)
    .filter((h) => INCLUDED_CAUSE_HABIT_CATEGORIES.has(h.category))
    .map((h) => matchItem(h.item));
}

/**
 * Full cause-candidate pool for the Lag Explorer's dropdown: top-tracked
 * foods and food categories, non-reactive supplements, and exercise/movement
 * habits (so "is exercise related to symptoms at all?" is answerable in the
 * UI, not just in this module).
 */
export interface CauseOption {
  label: string;
  matcher: ItemMatcher;
}

export function allCauseOptions(events: CanonicalEvent[]): CauseOption[] {
  const foods = rankedFoods(events).map((f) => ({ label: `Food: ${f.item}`, matcher: matchItem(f.item) }));
  const categories = foodCategoryDistribution(events)
    .filter((c) => c.count > 0)
    .map((c) => ({ label: `Food category: ${c.category}`, matcher: matchCategory(c.category) }));
  const supplements = supplementStats(events).map((s) => ({
    label: `Supplement: ${s.item}`,
    matcher: matchItem(s.item),
  }));
  const habits = habitCauseCandidates(events).map((m) => ({ label: `Exercise/Movement: ${m.label}`, matcher: m }));
  return [...foods, ...categories, ...supplements, ...habits];
}

/**
 * Every scan this module runs (12 foods + N supplements + N exercise/movement
 * habits, against every outcome, across 4 lags) is a multiple-comparisons
 * setup: the more pairs checked, the more likely *some* pair clears the
 * diff-pct bar by chance alone, even with an adequate per-pair sample size.
 * Surfaced in the UI wherever `generateTopPatterns` results are shown.
 */
export const MULTIPLE_COMPARISONS_NOTE =
  "This list is generated by scanning many food/supplement/exercise × symptom × timing combinations and keeping only the strongest gaps. With that many comparisons, some apparently strong associations are expected to appear by chance alone — treat every entry here as a hypothesis worth watching, not a conclusion.";

/**
 * Scans a curated set of cause candidates (specific top-tracked foods,
 * non-reactive supplements, and exercise/movement habits — never a whole
 * food category) against tracked symptom/outcome items (including stool
 * quality flags, excluding the Bristol scale itself), checking same day
 * through +3 days for each pair, and surfaces only the strongest-lag
 * association per pair when it has both an adequate sample size and a
 * non-trivial percentage-point gap. Purely descriptive — never implies
 * causation. See `MULTIPLE_COMPARISONS_NOTE`.
 */
export function generateTopPatterns(events: CanonicalEvent[]): AssociationResult[] {
  const outcomeItems = Array.from(
    new Set(
      events
        .filter((e) => e.itemType === "outcome" && e.subcategory !== "Bristol Scale")
        .map((e) => e.item),
    ),
  );
  if (outcomeItems.length === 0) return [];

  // Specific foods only, never a whole category — "bloating after Veggies"
  // isn't an actionable signal (of course a broad category correlates with
  // something eaten most days); "bloating after Onion" is. Category-level
  // breakdowns belong on the Food dashboard, not here.
  const causeCandidates: ItemMatcher[] = [
    ...rankedFoods(events)
      .slice(0, TOP_CANDIDATE_FOODS)
      .map((f) => matchItem(f.item)),
    ...supplementStats(events)
      .filter((s) => !EXCLUDED_CAUSE_SUPPLEMENT_CATEGORIES.has(s.category))
      .map((s) => matchItem(s.item)),
    ...habitCauseCandidates(events),
  ];

  const results: AssociationResult[] = [];
  for (const outcomeName of outcomeItems) {
    const outcome = matchItem(outcomeName);
    const trackedSet = outcomeTrackedDates(events, outcomeName);
    for (const cause of causeCandidates) {
      if (cause.label === outcome.label) continue;

      let best: AssociationResult | null = null;
      for (const lag of SCAN_LAGS) {
        const assoc = computeAssociation(events, cause, outcome, trackedSet, lag);
        if (assoc.sampleTier === "insufficient") continue;
        if (!best || Math.abs(assoc.diffPct) > Math.abs(best.diffPct)) best = assoc;
      }
      if (best && Math.abs(best.diffPct) >= MIN_INTERESTING_DIFF_PCT) {
        results.push(best);
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, MAX_TOP_PATTERNS);
}

const MIN_TOLERATED_EXPOSURE_DAYS = 20;
/**
 * A food counts as "low observed association" when even its single worst
 * same-day diff, scanned across every tracked digestive symptom, doesn't
 * clear the same bar (`MIN_INTERESTING_DIFF_PCT`) this app already uses to
 * call an association notable elsewhere — rather than a separate, stricter
 * threshold that a real multi-symptom dataset would rarely clear for any
 * food (scanning several symptoms per food all but guarantees *some*
 * symptom shows a double-digit diff by chance alone).
 */
const MAX_TOLERATED_SYMPTOM_DIFF_PCT = MIN_INTERESTING_DIFF_PCT;

export interface ToleratedFoodEntry {
  item: string;
  category: string;
  exposureDays: number;
  /** Largest same-day percentage-point diff (with-minus-without) among tracked digestive symptoms for this food. */
  worstSymptomDiffPct: number;
  worstSymptomLabel: string | null;
}

export function digestiveSymptomItems(events: CanonicalEvent[]): string[] {
  return Array.from(new Set(events.filter((e) => e.category === "Digestive Symptom").map((e) => e.item)));
}

interface WorstSymptomResult {
  anyAdequate: boolean;
  exposureDays: number;
  worstDiffPct: number;
  worstLabel: string | null;
}

/**
 * Scans every tracked digestive symptom for the largest same-day
 * percentage-point diff against a single cause, using only symptom pairs
 * with an adequate sample. Shared by the tolerated-foods and new-foods
 * context views below so both use one consistent same-day symptom check.
 */
export function worstSameDaySymptomDiff(
  events: CanonicalEvent[],
  symptomItems: string[],
  cause: ItemMatcher,
  minExposureDays = 0,
): WorstSymptomResult {
  let worstDiffPct = -Infinity;
  let worstLabel: string | null = null;
  let exposureDays = 0;
  let anyAdequate = false;

  for (const symptomName of symptomItems) {
    const outcome = matchItem(symptomName);
    const trackedSet = outcomeTrackedDates(events, symptomName);
    const assoc = computeAssociation(events, cause, outcome, trackedSet, 0);
    if (assoc.sampleTier === "insufficient" || assoc.withTotal < minExposureDays) continue;
    anyAdequate = true;
    exposureDays = assoc.withTotal;
    if (assoc.diffPct > worstDiffPct) {
      worstDiffPct = assoc.diffPct;
      worstLabel = symptomName;
    }
  }

  return { anyAdequate, exposureDays, worstDiffPct, worstLabel };
}

/**
 * Inverse of the association scan: foods eaten often enough to judge, where
 * no tracked digestive symptom shows a meaningfully higher same-day rate
 * than on days without the food. This is NOT a "safe foods" list — it only
 * means no elevated same-day co-occurrence was observed in this data, at
 * this sample size, for the symptoms actually being tracked.
 */
export function lowSymptomAssociationFoods(events: CanonicalEvent[]): ToleratedFoodEntry[] {
  const symptomItems = digestiveSymptomItems(events);
  if (symptomItems.length === 0) return [];

  const foods = rankedFoods(events).filter((f) => f.count >= MIN_TOLERATED_EXPOSURE_DAYS);

  const results: ToleratedFoodEntry[] = [];
  for (const food of foods) {
    const worst = worstSameDaySymptomDiff(events, symptomItems, matchItem(food.item));
    if (worst.anyAdequate && worst.worstDiffPct <= MAX_TOLERATED_SYMPTOM_DIFF_PCT) {
      results.push({
        item: food.item,
        category: food.category,
        exposureDays: worst.exposureDays,
        worstSymptomDiffPct: worst.worstDiffPct,
        worstSymptomLabel: worst.worstLabel,
      });
    }
  }

  return results.sort((a, b) => b.exposureDays - a.exposureDays);
}

const MIN_NEW_FOOD_SYMPTOM_EXPOSURE_DAYS = 10; // matches the "exploratory" sample tier floor

export type NewFoodSymptomReadout = "insufficient-data" | "no-elevated-association" | "elevated-association";

export interface NewFoodContextEntry {
  item: string;
  category: string;
  firstSeenDate: string;
  /** Total times this food has been logged (including the first occurrence). */
  timesEatenTotal: number;
  symptomReadout: NewFoodSymptomReadout;
  /** e.g. "+22pp Bloating" — set whenever a same-day comparison was possible, regardless of readout. */
  symptomDetail: string | null;
}

/**
 * Enriches the "new foods" list with whether it's been eaten again since,
 * and a same-day symptom check gated by its own (lower) minimum, since a
 * newly-introduced food will rarely have 20-30 exposures yet. Below that
 * minimum, the readout is explicitly "insufficient-data" — absence of an
 * elevated association is never reported as evidence of tolerance here.
 */
export function recentNewFoodsWithContext(events: CanonicalEvent[], limit = 15): NewFoodContextEntry[] {
  const newFoods = newFoodsOverTime(events).slice(-limit).reverse();
  const counts = new Map(rankedFoods(events).map((f) => [f.item, f.count]));
  const symptomItems = digestiveSymptomItems(events);

  return newFoods.map((f) => {
    const worst = symptomItems.length
      ? worstSameDaySymptomDiff(events, symptomItems, matchItem(f.item), MIN_NEW_FOOD_SYMPTOM_EXPOSURE_DAYS)
      : { anyAdequate: false, exposureDays: 0, worstDiffPct: 0, worstLabel: null };

    let symptomReadout: NewFoodSymptomReadout = "insufficient-data";
    let symptomDetail: string | null = null;
    if (worst.anyAdequate) {
      symptomReadout = worst.worstDiffPct >= MIN_INTERESTING_DIFF_PCT ? "elevated-association" : "no-elevated-association";
      if (worst.worstLabel) {
        symptomDetail = `${worst.worstDiffPct > 0 ? "+" : ""}${worst.worstDiffPct}pp ${worst.worstLabel}`;
      }
    }

    return {
      item: f.item,
      category: f.category,
      firstSeenDate: f.firstSeenDate,
      timesEatenTotal: counts.get(f.item) ?? 0,
      symptomReadout,
      symptomDetail,
    };
  });
}
