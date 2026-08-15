import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, pct, trackedCalendarDates } from "./common";
import { rankedFoods, foodCategoryDistribution } from "./food";
import { supplementStats } from "./supplements";

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
  sampleSizeAdequate: boolean;
}

const MIN_SAMPLE_PER_GROUP = 5;

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
    sampleSizeAdequate: withTotal >= MIN_SAMPLE_PER_GROUP && withoutTotal >= MIN_SAMPLE_PER_GROUP,
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

const MIN_INTERESTING_DIFF_PCT = 15;
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

/**
 * Scans a curated set of cause candidates (top-tracked foods, food
 * categories, and non-reactive supplements) against tracked symptom/outcome
 * items (including stool quality flags, excluding the Bristol scale
 * itself), checking same day through +3 days for each pair, and surfaces
 * only the strongest-lag association per pair when it has both an adequate
 * sample size and a non-trivial percentage-point gap. Purely descriptive —
 * never implies causation.
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

  const causeCandidates: ItemMatcher[] = [
    ...rankedFoods(events)
      .slice(0, TOP_CANDIDATE_FOODS)
      .map((f) => matchItem(f.item)),
    ...foodCategoryDistribution(events)
      .filter((c) => c.count > 0)
      .map((c) => matchCategory(c.category)),
    ...supplementStats(events)
      .filter((s) => !EXCLUDED_CAUSE_SUPPLEMENT_CATEGORIES.has(s.category))
      .map((s) => matchItem(s.item)),
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
        if (!assoc.sampleSizeAdequate) continue;
        if (!best || Math.abs(assoc.diffPct) > Math.abs(best.diffPct)) best = assoc;
      }
      if (best && Math.abs(best.diffPct) >= MIN_INTERESTING_DIFF_PCT) {
        results.push(best);
      }
    }
  }

  return results.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, MAX_TOP_PATTERNS);
}
