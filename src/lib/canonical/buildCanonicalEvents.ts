import type { CanonicalEvent, RawDiaryEntry, RawLog, RawItem } from "@/lib/types";

function diaryKey(itemIdentity: string, date: string): string {
  return `${itemIdentity}|${date}`;
}

/**
 * Normalization layer: turns raw items + logs into the canonical
 * long-format dataset (date, item, item_type, category, value, completed,
 * source, ...) that every dashboard reads from. Category/type come
 * straight off the item row now — there's no more name-matched
 * classification step, since every item carries its own explicit category.
 */
export function buildCanonicalEvents(items: RawItem[], logs: RawLog[], diary: RawDiaryEntry[]): CanonicalEvent[] {
  const itemsByIdentity = new Map(items.map((i) => [i.identity, i]));

  const notesByKey = new Map<string, string[]>();
  for (const d of diary) {
    if (!d.content) continue;
    const key = diaryKey(d.itemIdentity, d.date);
    const list = notesByKey.get(key) ?? [];
    list.push(d.content);
    notesByKey.set(key, list);
  }

  const canonical: CanonicalEvent[] = [];
  for (const log of logs) {
    // The composite FK from logs to items (on delete restrict) means an
    // item can't be deleted while it has logs — this is a defensive
    // fallback for a not-yet-synced item, not a real deletion path.
    const item = itemsByIdentity.get(log.itemIdentity);
    if (!item) continue;

    const notes = notesByKey.get(diaryKey(log.itemIdentity, log.date));

    canonical.push({
      id: log.identity,
      date: log.date,
      item: item.rawName,
      itemType: item.itemType,
      category: item.category,
      value: log.value,
      completed: (log.value ?? 0) > 0,
      isArchived: item.isArchived,
      source: "item-log",
      itemIdentity: log.itemIdentity,
      note: notes && notes.length > 0 ? notes.join(" | ") : null,
      updatedAt: log.updatedAt,
      mealTag: log.mealTag,
    });
  }

  return canonical;
}
