import { classifyItem, type OverrideEntry } from "@/taxonomy/classify";
import type { CanonicalEvent, RawDiaryEntry, RawLog, RawItem } from "@/lib/types";

function diaryKey(itemIdentity: string, date: string): string {
  return `${itemIdentity}|${date}`;
}

export interface BuildCanonicalResult {
  events: CanonicalEvent[];
  /** Raw item names that fell through to the generic fallback classification. */
  unclassifiedItems: string[];
}

/**
 * Normalization + taxonomy layer: turns raw extracted rows into the
 * canonical long-format dataset (date, item, item_type, category,
 * subcategory, value, completed, source, ...) that every dashboard and
 * future statistical/ML layer reads from. Never invents values — a
 * missing item name becomes an explicitly-labeled unknown, not a guess.
 */
export function buildCanonicalEvents(
  items: RawItem[],
  logs: RawLog[],
  diary: RawDiaryEntry[],
  userOverrides?: Record<string, OverrideEntry>,
): BuildCanonicalResult {
  const itemsByIdentity = new Map(items.map((i) => [i.identity, i]));

  const notesByKey = new Map<string, string[]>();
  for (const d of diary) {
    if (!d.content) continue;
    const key = diaryKey(d.itemIdentity, d.date);
    const list = notesByKey.get(key) ?? [];
    list.push(d.content);
    notesByKey.set(key, list);
  }

  const unclassified = new Set<string>();

  const canonical: CanonicalEvent[] = [];
  for (const log of logs) {
    const item = itemsByIdentity.get(log.itemIdentity);
    // Archived/deleted items (isRemoved, incl. those recovered only via
    // ZDELETEDHABIT for name resolution) are excluded from the analytical
    // dataset entirely rather than shown under a resolved name.
    if (item?.isRemoved) continue;

    const rawName = item?.rawName ?? `Unknown item (${log.itemIdentity.slice(0, 8)})`;
    const classification = classifyItem(rawName, userOverrides);
    if (classification.matchedBy === "fallback") unclassified.add(rawName);

    const notes = notesByKey.get(diaryKey(log.itemIdentity, log.date));

    canonical.push({
      id: log.identity,
      date: log.date,
      item: classification.canonicalName,
      rawItem: rawName,
      itemType: classification.itemType,
      category: classification.category,
      subcategory: classification.subcategory,
      value: log.value,
      goalValue: log.goalValue,
      completed: !log.isSkipped && (log.value ?? 0) > 0,
      isSkipped: log.isSkipped,
      unit: item?.unit ?? null,
      kind: item?.kind ?? null,
      isArchived: item?.isArchived ?? false,
      source: "item-log",
      itemIdentity: log.itemIdentity,
      note: notes && notes.length > 0 ? notes.join(" | ") : null,
      matchedBy: classification.matchedBy,
      updatedAt: log.updatedAt,
      mealTag: log.mealTag,
    });
  }

  return { events: canonical, unclassifiedItems: Array.from(unclassified).sort() };
}
