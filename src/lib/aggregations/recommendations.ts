import type { CanonicalEvent } from "@/lib/types";
import { FOOD_CATEGORIES } from "@/taxonomy/categories";
import { addDaysToDate, getDatasetSpan, pct } from "./common";
import { supplementStats } from "./supplements";

export interface Insight {
  title: string;
  /** What the data directly shows — a plain fact with a sample size. */
  observed: string;
  /** A cautious, non-causal reading of that fact. */
  interpretation: string;
  /** Only present when the observation is strong/simple enough to act on directly. */
  recommendation: string | null;
}

const RECENT_WINDOW_DAYS = 14;
const LOW_TRACKING_DAYS_THRESHOLD = 4; // out of RECENT_WINDOW_DAYS

/**
 * "What might be worth adjusting?" — Stage 1 keeps this deliberately
 * conservative: it flags categories with little recent data and
 * supplements whose consistency has dropped, always with the sample size
 * attached. It never makes a nutritional claim ("eat more X") because the
 * dataset has no nutrient-quantity information to support one.
 */
export function generateInsights(events: CanonicalEvent[]): Insight[] {
  const span = getDatasetSpan(events);
  if (!span) return [];

  const windowStart = addDaysToDate(span.end, -(RECENT_WINDOW_DAYS - 1));
  const recentEvents = events.filter((e) => e.date >= windowStart && e.date <= span.end);

  const insights: Insight[] = [];

  // Food-category tracking coverage in the recent window.
  for (const category of FOOD_CATEGORIES) {
    const trackedDays = new Set(
      recentEvents
        .filter((e) => e.itemType === "food" && e.category === category && e.completed)
        .map((e) => e.date),
    ).size;

    const everTracked = events.some((e) => e.itemType === "food" && e.category === category);
    if (!everTracked) continue; // never part of this person's tracked vocabulary — nothing to say

    if (trackedDays <= LOW_TRACKING_DAYS_THRESHOLD) {
      insights.push({
        title: `${category}: low recent tracking`,
        observed: `${category} was tracked on ${trackedDays} of the last ${RECENT_WINDOW_DAYS} days.`,
        interpretation:
          "This could mean the category is genuinely eaten rarely, or that it simply isn't being logged consistently — the data can't tell these apart.",
        recommendation:
          trackedDays === 0
            ? `If you want reliable pattern analysis for ${category.toLowerCase()}, it needs to be logged more consistently — right now there's close to no recent data to work with.`
            : null,
      });
    }
  }

  // Supplement consistency trend: last window vs. all-time.
  const allTimeStats = supplementStats(events);
  const recentStats = supplementStats(recentEvents);
  for (const stat of allTimeStats) {
    const recent = recentStats.find((r) => r.item === stat.item);
    if (!recent || recent.daysTracked < 3) continue;
    const drop = stat.consistencyPct - recent.consistencyPct;
    if (drop >= 25) {
      insights.push({
        title: `${stat.item}: consistency dropped recently`,
        observed: `${stat.item} was completed on ${recent.daysCompleted}/${recent.daysTracked} tracked days in the last ${RECENT_WINDOW_DAYS} days (${recent.consistencyPct}%), vs ${stat.consistencyPct}% overall.`,
        interpretation: "Adherence has fallen off compared to your own historical baseline for this item.",
        recommendation: null,
      });
    }
  }

  return insights;
}

export interface CoverageSummary {
  totalTrackedDays: number;
  totalCalendarDays: number;
  coveragePct: number;
  gapDays: number;
}

export function trackingCoverageSummary(events: CanonicalEvent[]): CoverageSummary | null {
  const span = getDatasetSpan(events);
  if (!span) return null;
  const trackedDates = new Set(events.map((e) => e.date));
  const start = new Date(`${span.start}T00:00:00Z`);
  const end = new Date(`${span.end}T00:00:00Z`);
  const totalCalendarDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  return {
    totalTrackedDays: trackedDates.size,
    totalCalendarDays,
    coveragePct: pct(trackedDates.size, totalCalendarDays),
    gapDays: totalCalendarDays - trackedDates.size,
  };
}
