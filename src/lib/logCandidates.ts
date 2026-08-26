import type { ItemType } from "@/taxonomy/categories";
import type { RawLog, RawItem, RawDiaryEntry, WorkoutUnit } from "@/lib/types";

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
 *
 * An untagged row (`mealTag: null`) — from before per-meal tagging existed,
 * or from `toggleDailyLogInternal`'s own toggle path, which never sets one —
 * counts toward EVERY meal, not none: a strict `mealTag !== meal` filter
 * would make such a row invisible in every tab's count (since `null` never
 * equals any real tag), which made `decideChipTapAction` see "not logged"
 * everywhere and create a brand-new tagged row on top of it instead of
 * recognizing it was already logged — see `decrementDailyLogForMealInternal`'s
 * matching fallback, which is what actually lets removing it work once it's
 * counted here.
 */
export function loggedCountsForDate(logs: RawLog[], date: string, meal?: string | null): Map<string, number> {
  const counts = new Map<string, number>();
  for (const l of logs) {
    if (l.date !== date || (l.value ?? 0) <= 0) continue;
    if (meal != null && l.mealTag !== meal && l.mealTag != null) continue;
    counts.set(l.itemIdentity, (counts.get(l.itemIdentity) ?? 0) + 1);
  }
  return counts;
}

/** Combines the currently-viewed day with a local "HH:MM" into a full ISO
 * timestamp — the shape every log's `updatedAt`/`loggedAt` is stored as. */
export function combineDateAndTime(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

export function toTimeInputValue(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type ChipTapAction = "create" | "increment" | "decrement" | "toggle";

/**
 * Decides which action a tap on a Log-page chip should trigger. Pure
 * decision logic, no side effects — separated from the page's actual
 * handlers (which read/write IndexedDB and Supabase) so it's testable on
 * its own. Mirrors handleChipTap's exact prior inline logic: a catalog-only
 * chip (no real item yet) always creates first, regardless of the other
 * two inputs; otherwise a countable type (Food) increments or decrements
 * depending on whether it's already logged, and anything else is a plain
 * toggle.
 */
export function decideChipTapAction(candidate: LogCandidate, loggedCount: number, countable: boolean): ChipTapAction {
  if (candidate.itemIdentity === "") return "create";
  if (countable) return loggedCount > 0 ? "decrement" : "increment";
  return "toggle";
}

export interface TimelineEntry {
  key: string;
  item: string;
  /** "stool" alongside the four item types — Stool has no item/category of
   * its own, but still shows up in the same day timeline as everything
   * else, so this widens just for that display purpose. */
  itemType: ItemType | "stool";
  itemIdentity: string;
  time: string; // local HH:MM, from the log's updatedAt (= the moment it was logged)
  /** Same instant as `time`, unformatted — for merge-sorting against
   * another source (Stool) and for prefilling an editable time input,
   * which needs 24-hour "HH:MM" rather than a locale-formatted string. */
  updatedAt: string;
  mealTag: string | null;
  /** Raw logged value (e.g. minutes for a duration-kind item, or a
   * workout's weight/duration/reps) — most entries are plain occurrence
   * taps and don't need this. */
  value: number | null;
  /** Optional note for this item on this day — one per item+day, not per
   * individual tap, so a food logged 3x in a day shares one note across all
   * three entries rather than each having its own. */
  note: string | null;
  /** The item's own category — null for Stool, which has none. Shown as a
   * pill for types that don't already show a more specific grouping label
   * (Food shows its meal tag instead; see the timeline's own render). */
  category: string | null;
  /** Workout entries only — what `value` means (kg/minutes/reps), for
   * display alongside it. Null for every other type. */
  unit: WorkoutUnit | null;
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
    .sort((a, b) => {
      const byTime = (b.updatedAt as string).localeCompare(a.updatedAt as string);
      return byTime !== 0 ? byTime : b.identity.localeCompare(a.identity);
    });

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
      updatedAt: l.updatedAt as string,
      mealTag: l.mealTag,
      note: notesByItemIdentity.get(l.itemIdentity) ?? null,
      value: l.value,
      category: it.category,
      unit: null,
    });
  }
  return entries;
}
