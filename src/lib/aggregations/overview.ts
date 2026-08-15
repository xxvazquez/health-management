import type { CanonicalEvent } from "@/lib/types";
import { getDatasetSpan, listDatesBetween, pct, trackedCalendarDates } from "./common";
import { foodVarietySummary, rankedFoods } from "./food";
import { supplementStats } from "./supplements";
import { habitStats } from "./habits";
import { bristolDistribution } from "./digestion";

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
      ? Math.round(
          (supplements.reduce((sum, s) => sum + s.consistencyPct, 0) / supplements.length) * 10,
        ) / 10
      : 0;
  const mostConsistentSupplement = [...supplements].sort((a, b) => b.consistencyPct - a.consistencyPct)[0];

  const bristol = bristolDistribution(events);
  const topBristol = [...bristol].sort((a, b) => b.count - a.count)[0];

  const digestiveSymptomDays = new Set(
    events.filter((e) => e.category === "Digestive Symptom" && e.completed).map((e) => e.date),
  ).size;

  const habits = habitStats(events);
  const avgHabitConsistency =
    habits.length > 0
      ? Math.round((habits.reduce((sum, h) => sum + h.consistencyPct, 0) / habits.length) * 10) / 10
      : 0;

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
