import type { CanonicalEvent } from "@/lib/types";
import { isoWeekStart, pct, trackedCalendarDates } from "./common";
import { computeItemStats, type ItemStats } from "./itemStats";

const BRISTOL_ORDER = ["Bristol 1", "Bristol 2", "Bristol 3", "Bristol 4", "Bristol 5", "No Bristol"];

export interface BristolDistributionEntry {
  item: string;
  count: number;
  sharePct: number;
}

function bristolEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return events.filter((e) => e.subcategory === "Bristol Scale" && e.completed);
}

export function bristolDistribution(events: CanonicalEvent[]): BristolDistributionEntry[] {
  const bristol = bristolEvents(events);
  const total = bristol.length;
  const counts = new Map<string, number>();
  for (const e of bristol) counts.set(e.item, (counts.get(e.item) ?? 0) + 1);
  return BRISTOL_ORDER.filter((item) => counts.has(item)).map((item) => ({
    item,
    count: counts.get(item) ?? 0,
    sharePct: pct(counts.get(item) ?? 0, total),
  }));
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
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.subcategory === "Stool Quality"),
    activeDates,
  );
}

export function digestiveSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.category === "Digestive Symptom"),
    activeDates,
  );
}

export function otherSymptomStats(events: CanonicalEvent[]): ItemStats[] {
  const activeDates = Array.from(trackedCalendarDates(events)).sort();
  return computeItemStats(
    events.filter((e) => e.category === "Other Symptom"),
    activeDates,
  );
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
