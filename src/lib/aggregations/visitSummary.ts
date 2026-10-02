import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, daysBetween, symptomTrackedDates, trackedDatesForType, type DateRange } from "./common";

export interface SymptomSummary {
  item: string;
  /** Days it was logged in the period. */
  days: number;
  /** Days symptoms were being logged in the period. */
  trackedDays: number;
  /** Average of each day's highest level (1–3), or null when it's never been rated. */
  averageLevel: number | null;
  /** The same counts over the period just before, for the trend — null when
   * the symptom wasn't being logged yet for all of it. */
  previous: { days: number; trackedDays: number } | null;
}

/** The period of the same length that ends the day before `range` starts. */
export function previousRange(range: DateRange): DateRange {
  const length = daysBetween(range.start, range.end) + 1;
  return { start: addDaysToDate(range.start, -length), end: addDaysToDate(range.start, -1) };
}

function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

/** Every symptom logged in `range`, most days first, with its average level
 * and the same counts for the period before. Only days symptoms were being
 * logged count, so an unlogged stretch never reads as "symptom-free". */
export function symptomSummaries(events: CanonicalEvent[], range: DateRange): SymptomSummary[] {
  const tracked = symptomTrackedDates(events);
  const before = previousRange(range);
  const countTracked = (r: DateRange) => Array.from(tracked).filter((d) => inRange(d, r)).length;
  const trackedDays = countTracked(range);
  const previousTracked = countTracked(before);

  const levelsByItem = new Map<string, Map<string, number>>();
  for (const e of events) {
    if (e.itemType !== "outcome" || !e.completed) continue;
    const levels = levelsByItem.get(e.item) ?? new Map<string, number>();
    levels.set(e.date, Math.max(levels.get(e.date) ?? 0, Math.min(3, e.value ?? 1)));
    levelsByItem.set(e.item, levels);
  }

  const out: SymptomSummary[] = [];
  for (const [item, levels] of levelsByItem) {
    const now = Array.from(levels).filter(([d]) => inRange(d, range));
    if (now.length === 0) continue;
    const rated = new Set(levels.values()).size > 1;
    // Before its first entry a symptom wasn't being logged, so a period
    // that starts earlier has nothing to compare against.
    const first = Array.from(levels.keys()).sort()[0];
    out.push({
      item,
      days: now.length,
      trackedDays,
      averageLevel: rated ? Math.round((now.reduce((n, [, v]) => n + v, 0) / now.length) * 10) / 10 : null,
      previous:
        first <= before.start && previousTracked > 0
          ? { days: Array.from(levels.keys()).filter((d) => inRange(d, before)).length, trackedDays: previousTracked }
          : null,
    });
  }
  return out.sort((a, b) => b.days - a.days || a.item.localeCompare(b.item));
}

export interface SupplementSummary {
  item: string;
  itemIdentity: string;
  category: string;
  /** Days taken in the last four weeks of the period. */
  recentDays: number;
}

const RECENT_DAYS = 28;

/** What's being taken now: supplements and medication logged in the last
 * four weeks of `range`, most often first. */
export function currentSupplements(events: CanonicalEvent[], range: DateRange): SupplementSummary[] {
  const recent: DateRange = { start: addDaysToDate(range.end, -(RECENT_DAYS - 1)), end: range.end };
  const tracked = trackedDatesForType(events, "supplement");
  const byItem = new Map<string, { identity: string; category: string; dates: Set<string> }>();
  for (const e of events) {
    if (e.itemType !== "supplement" || !e.completed || !inRange(e.date, recent) || !tracked.has(e.date)) continue;
    const entry = byItem.get(e.item) ?? { identity: e.itemIdentity, category: e.category, dates: new Set<string>() };
    entry.dates.add(e.date);
    byItem.set(e.item, entry);
  }
  return Array.from(byItem, ([item, v]) => ({ item, itemIdentity: v.identity, category: v.category, recentDays: v.dates.size })).sort(
    (a, b) => b.recentDays - a.recentDays || a.item.localeCompare(b.item),
  );
}
