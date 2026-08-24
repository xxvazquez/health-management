import type { CanonicalEvent } from "@/lib/types";
import { normalizeName } from "@/taxonomy/normalizeName";
import { POLAND_SEASONAL_PRODUCE } from "@/lib/seasonalProduce";
import { addDaysToDate } from "./common";

export interface SeasonalPick {
  item: string;
  /** null = never logged at all, not just "not recently" */
  weeksSinceLastEaten: number | null;
}

/**
 * This month's seasonal produce, ranked most-neglected first (never-eaten
 * items rank above ones eaten a while back, which rank above recent ones).
 * Matches by normalized name against the person's own food log, so it
 * reflects what they actually call things, not just an exact string match.
 */
export function seasonalPicksForMonth(
  events: CanonicalEvent[],
  month: number,
  referenceDate: string,
): SeasonalPick[] {
  const items = POLAND_SEASONAL_PRODUCE[month] ?? [];
  const lastEatenByNorm = new Map<string, string>();
  for (const e of events) {
    if (e.itemType !== "food" || !e.completed) continue;
    const key = normalizeName(e.item);
    const prev = lastEatenByNorm.get(key);
    if (!prev || e.date > prev) lastEatenByNorm.set(key, e.date);
  }

  const refTime = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const picks = items.map((item) => {
    const last = lastEatenByNorm.get(normalizeName(item));
    if (!last) return { item, weeksSinceLastEaten: null };
    const days = Math.round((refTime - new Date(`${last}T00:00:00Z`).getTime()) / 86_400_000);
    return { item, weeksSinceLastEaten: Math.max(0, Math.floor(days / 7)) };
  });

  return picks.sort((a, b) => (b.weeksSinceLastEaten ?? Infinity) - (a.weeksSinceLastEaten ?? Infinity));
}

export interface WeeklyCategoryStat {
  category: string;
  countThisWeek: number;
}

// Categories that should never surface as "this week's priority" regardless
// of how rarely they're logged — deliberate, not neglected. Meat is the one
// case so far: rarely eating it is the intent, not a gap to nudge toward
// closing.
const NEVER_PRIORITIZE_CATEGORIES = new Set(["meat"]);

/**
 * Food-category counts over the trailing 7 days (today inclusive), so "this
 * week's least-tracked category" always means the same rolling window
 * regardless of when it's checked.
 */
export function weeklyCategoryPriority(events: CanonicalEvent[], referenceDate: string): WeeklyCategoryStat[] {
  const weekStart = addDaysToDate(referenceDate, -6);
  // Zero-fill against every category the person has ever logged food under
  // (not just this week's), so a category they use but skipped this week
  // still surfaces as "least tracked" instead of disappearing entirely.
  const byCategory = new Map<string, number>();
  for (const e of events) {
    if (e.itemType !== "food" || !e.completed) continue;
    if (NEVER_PRIORITIZE_CATEGORIES.has(normalizeName(e.category))) continue;
    if (!byCategory.has(e.category)) byCategory.set(e.category, 0);
    if (e.date < weekStart || e.date > referenceDate) continue;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);
  }
  return Array.from(byCategory.entries())
    .map(([category, countThisWeek]) => ({ category, countThisWeek }))
    .sort((a, b) => a.countThisWeek - b.countThisWeek);
}
