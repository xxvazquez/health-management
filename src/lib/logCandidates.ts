import { classifyHabit, type OverrideEntry } from "@/taxonomy/classify";
import type { ItemType } from "@/taxonomy/categories";
import type { RawEvent, RawHabit } from "@/lib/types";

export interface LogCandidate {
  key: string; // `${itemType}|${canonicalName}` — stable identity for a chip
  item: string;
  itemType: ItemType;
  category: string;
  /** Habit identity to write new events against. Existing item -> its real
   * identity; brand-new item -> a freshly generated `manual:` identity. */
  habitIdentity: string;
  count: number;
}

/**
 * One tappable chip per distinct classified item. Deliberately built from
 * *all* known habits (not the dashboard-filtered event set), so an item
 * that went quiet 90+ days ago and got archived from the dashboards can
 * still be tapped back into use here. Sorted alphabetically within category
 * — the Log page groups by category and relies on that order to make a
 * specific item findable by eye without typing.
 */
export function buildLogCandidates(
  habits: RawHabit[],
  events: RawEvent[],
  userOverrides: Record<string, OverrideEntry>,
): LogCandidate[] {
  const eventCountByHabit = new Map<string, number>();
  for (const e of events) {
    eventCountByHabit.set(e.habitIdentity, (eventCountByHabit.get(e.habitIdentity) ?? 0) + 1);
  }

  const byKey = new Map<string, LogCandidate>();
  for (const h of habits) {
    if (h.isRemoved) continue;
    const c = classifyHabit(h.rawName, userOverrides);
    const count = eventCountByHabit.get(h.identity) ?? 0;
    const key = `${c.itemType}|${c.canonicalName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        item: c.canonicalName,
        itemType: c.itemType,
        category: c.category,
        habitIdentity: h.identity,
        count,
      });
    } else {
      existing.count += count;
      // Keep whichever habit identity has logged the most, so new taps land
      // on the identity most of this item's history already lives under.
      if (count > (eventCountByHabit.get(existing.habitIdentity) ?? 0)) {
        existing.habitIdentity = h.identity;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.item.localeCompare(b.item));
}

/** Generates a fresh identity for a brand-new manually-logged item. */
export function generateManualHabitId(key: string): string {
  return `manual:${key.replace(/\s+/g, "-")}-${Date.now()}`;
}

/**
 * Occurrence count per item (`${itemType}|${canonicalName}`) on `date` —
 * one event row counts as one occurrence, matching how every other
 * aggregation in the app already counts rows rather than reading `value`.
 */
export function loggedCountsForDate(
  habits: RawHabit[],
  events: RawEvent[],
  userOverrides: Record<string, OverrideEntry>,
  date: string,
): Map<string, number> {
  const habitsById = new Map(habits.map((h) => [h.identity, h]));
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.date !== date || e.isSkipped || (e.value ?? 0) <= 0) continue;
    const habit = habitsById.get(e.habitIdentity);
    if (!habit) continue;
    const c = classifyHabit(habit.rawName, userOverrides);
    const key = `${c.itemType}|${c.canonicalName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface TimelineEntry {
  key: string;
  item: string;
  itemType: ItemType;
  time: string; // local HH:MM, from the event's updatedAt (= the moment it was logged)
  mealTag: string | null;
}

/**
 * Every event logged on `date`, in the order they happened — each one
 * already carries a timestamp (`updatedAt`, stamped at the moment of the
 * tap), so this needs no new field, just reading what's already there.
 * Entries with no timestamp (older imported rows with no ZUPDATEDATE) are
 * skipped rather than shown with a fabricated time.
 */
export function dayTimelineEntries(
  habits: RawHabit[],
  events: RawEvent[],
  userOverrides: Record<string, OverrideEntry>,
  date: string,
): TimelineEntry[] {
  const habitsById = new Map(habits.map((h) => [h.identity, h]));
  const relevant = events
    .filter((e) => e.date === date && !e.isSkipped && (e.value ?? 0) > 0 && e.updatedAt != null)
    .sort((a, b) => (a.updatedAt as number) - (b.updatedAt as number));

  const entries: TimelineEntry[] = [];
  for (const e of relevant) {
    const habit = habitsById.get(e.habitIdentity);
    if (!habit) continue;
    const c = classifyHabit(habit.rawName, userOverrides);
    entries.push({
      key: e.identity,
      item: c.canonicalName,
      itemType: c.itemType,
      time: new Date(e.updatedAt as number).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      mealTag: e.mealTag,
    });
  }
  return entries;
}
