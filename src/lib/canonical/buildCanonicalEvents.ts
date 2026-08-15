import { classifyHabit } from "@/taxonomy/classify";
import type { CanonicalEvent, RawDiaryEntry, RawEvent, RawHabit } from "@/lib/types";

function diaryKey(habitIdentity: string, date: string): string {
  return `${habitIdentity}|${date}`;
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
 * missing habit name becomes an explicitly-labeled unknown, not a guess.
 */
export function buildCanonicalEvents(
  habits: RawHabit[],
  events: RawEvent[],
  diary: RawDiaryEntry[],
): BuildCanonicalResult {
  const habitsByIdentity = new Map(habits.map((h) => [h.identity, h]));

  const notesByKey = new Map<string, string[]>();
  for (const d of diary) {
    if (!d.content) continue;
    const key = diaryKey(d.habitIdentity, d.date);
    const list = notesByKey.get(key) ?? [];
    list.push(d.content);
    notesByKey.set(key, list);
  }

  const unclassified = new Set<string>();

  const canonical: CanonicalEvent[] = [];
  for (const event of events) {
    const habit = habitsByIdentity.get(event.habitIdentity);
    // Archived/deleted habits (isRemoved, incl. those recovered only via
    // ZDELETEDHABIT for name resolution) are excluded from the analytical
    // dataset entirely rather than shown under a resolved name.
    if (habit?.isRemoved) continue;

    const rawName = habit?.rawName ?? `Unknown habit (${event.habitIdentity.slice(0, 8)})`;
    const classification = classifyHabit(rawName);
    if (classification.matchedBy === "fallback") unclassified.add(rawName);

    const notes = notesByKey.get(diaryKey(event.habitIdentity, event.date));

    canonical.push({
      id: event.identity,
      date: event.date,
      item: classification.canonicalName,
      rawItem: rawName,
      itemType: classification.itemType,
      category: classification.category,
      subcategory: classification.subcategory,
      value: event.value,
      goalValue: event.goalValue,
      completed: !event.isSkipped && (event.value ?? 0) > 0,
      isSkipped: event.isSkipped,
      unit: habit?.unit ?? null,
      kind: habit?.kind ?? null,
      source: "habit-daily-completion",
      habitIdentity: event.habitIdentity,
      note: notes && notes.length > 0 ? notes.join(" | ") : null,
      matchedBy: classification.matchedBy,
      updatedAt: event.updatedAt,
    });
  }

  return { events: canonical, unclassifiedItems: Array.from(unclassified).sort() };
}
