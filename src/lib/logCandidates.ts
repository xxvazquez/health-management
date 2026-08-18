import { classifyItem, type OverrideEntry } from "@/taxonomy/classify";
import type { ItemType } from "@/taxonomy/categories";
import { DELISTED_FROM_LOGGING } from "@/taxonomy/delistedFromLogging";
import type { RawLog, RawItem, RawDiaryEntry } from "@/lib/types";

export interface LogCandidate {
  key: string; // `${itemType}|${canonicalName}` — stable identity for a chip
  item: string;
  itemType: ItemType;
  category: string;
  /** Item identity to write new logs against. Existing item -> its real
   * identity; brand-new item -> a freshly generated `manual:` identity. */
  itemIdentity: string;
  count: number;
}

/**
 * One tappable chip per distinct classified item. Built from all known
 * *active* items (not the dashboard-filtered event set) — an item stays
 * tappable regardless of how long it's been quiet, right up until it's
 * explicitly archived. An archived item's chip disappears here but its
 * full history stays in every dashboard/analysis; unarchiving (from the
 * Habits/Supplements page) is what brings the chip back. Sorted
 * alphabetically within category — the Log page groups by category and
 * relies on that order to make a specific item findable by eye without typing.
 */
export function buildLogCandidates(
  items: RawItem[],
  logs: RawLog[],
  userOverrides: Record<string, OverrideEntry>,
): LogCandidate[] {
  const logCountByItem = new Map<string, number>();
  for (const l of logs) {
    logCountByItem.set(l.itemIdentity, (logCountByItem.get(l.itemIdentity) ?? 0) + 1);
  }

  const byKey = new Map<string, LogCandidate>();
  for (const it of items) {
    if (it.isRemoved || it.isArchived) continue;
    const c = classifyItem(it.rawName, userOverrides);
    if (DELISTED_FROM_LOGGING.has(c.canonicalName)) continue;
    const count = logCountByItem.get(it.identity) ?? 0;
    const key = `${c.itemType}|${c.canonicalName}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        item: c.canonicalName,
        itemType: c.itemType,
        category: c.category,
        itemIdentity: it.identity,
        count,
      });
    } else {
      existing.count += count;
      // Keep whichever identity has logged the most, so new taps land on
      // the identity most of this item's history already lives under.
      if (count > (logCountByItem.get(existing.itemIdentity) ?? 0)) {
        existing.itemIdentity = it.identity;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.item.localeCompare(b.item));
}

/** Generates a fresh identity for a brand-new manually-logged item. */
export function generateManualItemId(key: string): string {
  return `manual:${key.replace(/\s+/g, "-")}-${Date.now()}`;
}

/**
 * Occurrence count per item (`${itemType}|${canonicalName}`) on `date` —
 * one log row counts as one occurrence, matching how every other
 * aggregation in the app already counts rows rather than reading `value`.
 * Pass `meal` to further restrict to rows tagged with that meal — the Log
 * page uses this so the same food can be logged separately at breakfast,
 * lunch, and dinner without one meal's tap marking the others as done too.
 */
export function loggedCountsForDate(
  items: RawItem[],
  logs: RawLog[],
  userOverrides: Record<string, OverrideEntry>,
  date: string,
  meal?: string | null,
): Map<string, number> {
  const itemsById = new Map(items.map((i) => [i.identity, i]));
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.date !== date || l.isSkipped || (l.value ?? 0) <= 0) continue;
    if (meal != null && l.mealTag !== meal) continue;
    const it = itemsById.get(l.itemIdentity);
    if (!it) continue;
    const c = classifyItem(it.rawName, userOverrides);
    const key = `${c.itemType}|${c.canonicalName}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
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
  /** Optional note for this item on this day — one per item+day (see
   * `RawDiaryEntry`), not per individual tap, so a food logged 3x in a day
   * shares one note across all three entries rather than each having its own. */
  note: string | null;
}

/**
 * Every log entry on `date`, newest first — each one already carries a
 * timestamp (`updatedAt`, stamped at the moment of the tap), so this needs
 * no new field, just reading what's already there. Entries with no
 * timestamp (older imported rows with no ZUPDATEDATE) are skipped rather
 * than shown with a fabricated time.
 */
export function dayTimelineEntries(
  items: RawItem[],
  logs: RawLog[],
  userOverrides: Record<string, OverrideEntry>,
  diary: RawDiaryEntry[],
  date: string,
): TimelineEntry[] {
  const itemsById = new Map(items.map((i) => [i.identity, i]));
  const notesByItemIdentity = new Map(
    diary.filter((d) => d.date === date && d.content).map((d) => [d.itemIdentity, d.content as string]),
  );
  const relevant = logs
    .filter((l) => l.date === date && !l.isSkipped && (l.value ?? 0) > 0 && l.updatedAt != null)
    .sort((a, b) => (b.updatedAt as number) - (a.updatedAt as number));

  const entries: TimelineEntry[] = [];
  for (const l of relevant) {
    const it = itemsById.get(l.itemIdentity);
    if (!it) continue;
    const c = classifyItem(it.rawName, userOverrides);
    entries.push({
      key: l.identity,
      item: c.canonicalName,
      itemType: c.itemType,
      itemIdentity: l.itemIdentity,
      time: new Date(l.updatedAt as number).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
      mealTag: l.mealTag,
      note: notesByItemIdentity.get(l.itemIdentity) ?? null,
      value: l.value,
    });
  }
  return entries;
}
