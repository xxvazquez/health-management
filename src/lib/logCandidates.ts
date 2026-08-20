import type { ItemType } from "@/taxonomy/categories";
import type { RawLog, RawItem, RawDiaryEntry } from "@/lib/types";

export interface LogCandidate {
  /** = the item's own identity — stable and already unique, no merge key needed. */
  key: string;
  item: string;
  itemType: ItemType;
  category: string;
  itemIdentity: string;
  count: number;
}

/**
 * One tappable chip per active (non-archived) item. An archived item's chip
 * disappears here but its full history stays in every dashboard/analysis;
 * unarchiving (from Manage) brings the chip back. Sorted alphabetically
 * within category — the Log page groups by category and relies on that
 * order to make a specific item findable by eye without typing.
 */
export function buildLogCandidates(items: RawItem[], logs: RawLog[]): LogCandidate[] {
  const logCountByItem = new Map<string, number>();
  for (const l of logs) {
    logCountByItem.set(l.itemIdentity, (logCountByItem.get(l.itemIdentity) ?? 0) + 1);
  }
  return items
    .filter((it) => !it.isArchived)
    .map((it) => ({
      key: it.identity,
      item: it.rawName,
      itemType: it.itemType,
      category: it.category,
      itemIdentity: it.identity,
      count: logCountByItem.get(it.identity) ?? 0,
    }))
    .sort((a, b) => a.item.localeCompare(b.item));
}

/**
 * Occurrence count per item identity on `date` — one log row counts as one
 * occurrence. Pass `meal` to further restrict to rows tagged with that
 * meal — the Log page uses this so the same food can be logged separately
 * at breakfast, lunch, and dinner without one meal's tap marking the others
 * as done too.
 */
export function loggedCountsForDate(logs: RawLog[], date: string, meal?: string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.date !== date || (l.value ?? 0) <= 0) continue;
    if (meal != null && l.mealTag !== meal) continue;
    counts.set(l.itemIdentity, (counts.get(l.itemIdentity) ?? 0) + 1);
  }
  return counts;
}

export interface TimelineEntry {
  key: string;
  item: string;
  itemType: ItemType;
  itemIdentity: string;
  time: string; // local HH:MM, from the log's updatedAt (= the moment it was logged)
  mealTag: string | null;
  /** Raw logged value (e.g. minutes for a duration-kind item) — most
   * entries are plain occurrence taps and don't need this. */
  value: number | null;
  /** Optional note for this item on this day — one per item+day, not per
   * individual tap, so a food logged 3x in a day shares one note across all
   * three entries rather than each having its own. */
  note: string | null;
}

/**
 * Every log entry on `date`, newest first — each one already carries a
 * timestamp (`updatedAt`, stamped at the moment of the tap), so this needs
 * no new field, just reading what's already there.
 */
export function dayTimelineEntries(
  items: RawItem[],
  logs: RawLog[],
  diary: RawDiaryEntry[],
  date: string,
): TimelineEntry[] {
  const itemsById = new Map(items.map((i) => [i.identity, i]));
  const notesByItemIdentity = new Map(
    diary.filter((d) => d.date === date && d.content).map((d) => [d.itemIdentity, d.content as string]),
  );
  const relevant = logs
    .filter((l) => l.date === date && (l.value ?? 0) > 0 && l.updatedAt != null)
    .sort((a, b) => (b.updatedAt as string).localeCompare(a.updatedAt as string));

  const entries: TimelineEntry[] = [];
  for (const l of relevant) {
    const it = itemsById.get(l.itemIdentity);
    if (!it) continue;
    entries.push({
      key: l.identity,
      item: it.rawName,
      itemType: it.itemType,
      itemIdentity: l.itemIdentity,
      time: new Date(l.updatedAt as string).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      mealTag: l.mealTag,
      note: notesByItemIdentity.get(l.itemIdentity) ?? null,
      value: l.value,
    });
  }
  return entries;
}
