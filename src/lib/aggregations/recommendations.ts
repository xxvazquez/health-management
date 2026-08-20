import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, listDatesBetween, pct } from "./common";

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
 * conservative: it flags food categories with little recent tracking data,
 * always with the sample size attached. It never makes a nutritional claim
 * ("eat more X") because the dataset has no nutrient-quantity information
 * to support one.
 */
export function generateInsights(events: CanonicalEvent[]): Insight[] {
  const span = getDatasetSpan(events);
  if (!span) return [];

  const windowStart = addDaysToDate(span.end, -(RECENT_WINDOW_DAYS - 1));
  const recentEvents = events.filter((e) => e.date >= windowStart && e.date <= span.end);

  const insights: Insight[] = [];

  // Food-category tracking coverage in the recent window, for whatever
  // categories this person actually has (a fixed list would miss anything
  // they've added or renamed via Manage).
  const trackedCategories = new Set(events.filter((e) => e.itemType === "food").map((e) => e.category));
  for (const category of trackedCategories) {
    const trackedDays = new Set(
      recentEvents
        .filter((e) => e.itemType === "food" && e.category === category && e.completed)
        .map((e) => e.date),
    ).size;

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
  const totalCalendarDays = listDatesBetween(span.start, span.end).length;
  return {
    totalTrackedDays: trackedDates.size,
    totalCalendarDays,
    coveragePct: pct(trackedDates.size, totalCalendarDays),
    gapDays: totalCalendarDays - trackedDates.size,
  };
}
