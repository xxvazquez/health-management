import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, listDatesBetween, pct, round1, trackedCalendarDates } from "./common";
import { foodVarietySummary, rankedFoods } from "./food";
import { supplementStats, supplementsInsight } from "./supplements";
import { habitStats, habitsInsight } from "./habits";
import { bristolDistribution, digestionInsight } from "./digestion";
import { computeNutritionPriorities } from "./nutritionPriorities";
import type { Bullet, InsightTone } from "./insights";

export interface OverviewStats {
  dateRange: { start: string; end: string } | null;
  trackingCoverage: { trackedDays: number; totalCalendarDays: number; coveragePct: number };
  food: {
    categoriesTracked: number;
    totalFoodCategories: number;
    uniqueFoods: number;
    topFood: { item: string; count: number } | null;
  };
  supplements: {
    count: number;
    averageConsistencyPct: number;
    mostConsistent: { item: string; consistencyPct: number } | null;
  };
  digestion: {
    mostCommonBristol: { item: string; sharePct: number } | null;
    digestiveSymptomDaysPct: number;
  };
  habits: {
    count: number;
    averageConsistencyPct: number;
  };
}

export function computeOverviewStats(events: CanonicalEvent[]): OverviewStats {
  const span = getDatasetSpan(events);
  const trackedDates = trackedCalendarDates(events);
  const totalCalendarDays = span ? listDatesBetween(span.start, span.end).length : 0;

  const foodVariety = foodVarietySummary(events);
  const topFoods = rankedFoods(events);

  const supplements = supplementStats(events);
  const avgSupplementConsistency =
    supplements.length > 0
      ? round1(supplements.reduce((sum, s) => sum + s.consistencyPct, 0) / supplements.length)
      : 0;
  const mostConsistentSupplement = [...supplements].sort((a, b) => b.consistencyPct - a.consistencyPct)[0];

  const bristol = bristolDistribution(events);
  const topBristol = [...bristol].sort((a, b) => b.count - a.count)[0];

  const digestiveSymptomDays = new Set(
    events.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date),
  ).size;

  const habits = habitStats(events);
  const avgHabitConsistency =
    habits.length > 0 ? round1(habits.reduce((sum, h) => sum + h.consistencyPct, 0) / habits.length) : 0;

  return {
    dateRange: span,
    trackingCoverage: {
      trackedDays: trackedDates.size,
      totalCalendarDays,
      coveragePct: pct(trackedDates.size, totalCalendarDays),
    },
    food: {
      categoriesTracked: foodVariety.categoriesRepresented,
      totalFoodCategories: foodVariety.totalFoodCategories,
      uniqueFoods: foodVariety.uniqueFoods,
      topFood: topFoods[0] ? { item: topFoods[0].item, count: topFoods[0].count } : null,
    },
    supplements: {
      count: supplements.length,
      averageConsistencyPct: avgSupplementConsistency,
      mostConsistent: mostConsistentSupplement
        ? { item: mostConsistentSupplement.item, consistencyPct: mostConsistentSupplement.consistencyPct }
        : null,
    },
    digestion: {
      mostCommonBristol: topBristol ? { item: topBristol.item, sharePct: topBristol.sharePct } : null,
      digestiveSymptomDaysPct: pct(digestiveSymptomDays, trackedDates.size),
    },
    habits: {
      count: habits.length,
      averageConsistencyPct: avgHabitConsistency,
    },
  };
}

export interface OverviewInsight {
  insufficientData: boolean;
  headline: string;
  detail: string | null;
  tone: InsightTone;
  /** Evidence-grounded coverage that's genuinely well represented — sourced
   * only from Food's dietary-guidance engine, the one domain in this app
   * with an actual external basis for "this matters". */
  whatMatters: Bullet[];
  /** Evidence-grounded gaps — same source, same reasoning, the other
   * direction. Never populated from habit/supplement drift: neither has an
   * explicit user-defined target, so neither has a basis to be "attention
   * worthy" rather than merely "different from usual". */
  needsAttention: Bullet[];
  /** Purely personal longitudinal — what moved vs. this person's own
   * history, across every domain, with no claim about whether the move is
   * good or bad. */
  whatChanged: Bullet[];
}

const MIN_TRACKED_DAYS_FOR_INSIGHT = 10;
const COVERAGE_GOOD_PCT = 75;
const CHANGE_DAY_THRESHOLD = 2;
const CHANGE_COUNT_THRESHOLD = 2;

/**
 * "How am I doing overall" — the primary Overview insight. Two separate
 * questions, kept structurally separate rather than blended into one
 * ranking:
 *
 *  - "What matters / needs attention" comes ONLY from Food's
 *    evidence-informed engine (established dietary guidance + personal
 *    intake + sample-size gating) — the only domain here with a
 *    defensible external basis for calling something good or a gap.
 *  - "What changed" comes from every domain's own recent-vs-usual
 *    comparison, but is never used to rank domains against each other or
 *    to decide what's "attention worthy" — a big swing in something
 *    unimportant must never outrank a smaller but meaningful food-group
 *    gap, so drift never feeds the headline or the tone.
 */
export function computeOverviewInsight(events: CanonicalEvent[]): OverviewInsight {
  const span = getDatasetSpan(events);
  const trackedDates = trackedCalendarDates(events);

  if (!span || trackedDates.size < MIN_TRACKED_DAYS_FOR_INSIGHT) {
    return {
      insufficientData: true,
      headline: "Not enough data yet to summarize your patterns.",
      detail: "Keep logging — this section fills in once there's enough history to compare against.",
      tone: "neutral",
      whatMatters: [],
      needsAttention: [],
      whatChanged: [],
    };
  }

  const totalCalendarDays = listDatesBetween(span.start, span.end).length;
  const coveragePct = pct(trackedDates.size, totalCalendarDays);
  const coverageGood = coveragePct >= COVERAGE_GOOD_PCT;

  const habits = habitsInsight(events);
  const supplements = supplementsInsight(events);
  const food = computeNutritionPriorities(events);
  const digestion = digestionInsight(events);

  // --- What matters / needs attention: Food only, evidence-grounded ---
  const whatMatters: Bullet[] = food.insufficientData ? [] : food.doingWell.slice(0, 3);
  const needsAttention: Bullet[] = food.insufficientData
    ? []
    : food.topPriorities.slice(0, 3).map((p) => ({ label: p.headline, detail: p.detail }));

  let headline = coverageGood ? "Your tracking is consistent" : "Your tracking has been a bit patchy recently";
  if (food.insufficientData) {
    headline += ", though there's not yet enough food data logged to say what matters most.";
  } else if (needsAttention.length > 0) {
    headline += `, and ${needsAttention[0].label.toLowerCase()} could use more attention.`;
  } else if (whatMatters.length > 0) {
    headline += ", and your tracked food groups are looking well covered.";
  } else {
    headline += ".";
  }

  const tone: InsightTone = !food.insufficientData && needsAttention.length > 0 ? "attention" : coverageGood && !food.insufficientData ? "good" : "neutral";

  // --- What changed: every domain's own recent-vs-usual, neutral, capped ---
  const whatChanged: Bullet[] = [];
  const sortedTracked = Array.from(trackedDates).sort();
  const last7 = sortedTracked.filter((d) => d >= addDaysToDate(span.end, -6)).length;
  const prior7 = sortedTracked.filter((d) => d >= addDaysToDate(span.end, -13) && d < addDaysToDate(span.end, -6)).length;
  if (Math.abs(last7 - prior7) >= CHANGE_DAY_THRESHOLD) {
    whatChanged.push({ label: "Tracking", detail: `Logged on ${last7} of the last 7 days, vs. ${prior7} the week before.` });
  }
  if (!habits.insufficientData) {
    for (const b of habits.changed.slice(0, 2)) whatChanged.push({ label: `Habits: ${b.label}`, detail: b.detail });
  }
  if (!supplements.insufficientData) {
    for (const b of supplements.changed.slice(0, 2)) whatChanged.push({ label: `Supplements: ${b.label}`, detail: b.detail });
  }
  const plantTrend = food.trend.available ? food.trend.points.find((p) => p.label.startsWith("Plant diversity")) : null;
  if (plantTrend && Math.abs(plantTrend.current - plantTrend.previous) >= CHANGE_COUNT_THRESHOLD) {
    whatChanged.push({ label: "Food variety", detail: `Unique plant foods over 30 days: ${plantTrend.previous} → ${plantTrend.current}.` });
  }
  if (!digestion.insufficientData) {
    for (const b of digestion.changed.slice(0, 1)) whatChanged.push({ label: `Digestion: ${b.label}`, detail: b.detail });
  }

  return {
    insufficientData: false,
    headline,
    detail: null,
    tone,
    whatMatters,
    needsAttention,
    whatChanged: whatChanged.slice(0, 6),
  };
}
