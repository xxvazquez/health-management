import type { CanonicalEvent } from "@/lib/types";
import { ARCHIVED_STALE_DAYS } from "@/lib/config";
import { EXPLICITLY_ARCHIVED_ITEMS } from "./archivedOverrides";

export interface FilterArchivedResult {
  events: CanonicalEvent[];
  /** Items dropped entirely, with the date they were last actually tracked — never silent. */
  archivedItems: { item: string; lastTrackedDate: string; reason: "explicit" | "inactivity" }[];
}

/**
 * The recency heuristic only applies to habits and supplements — ongoing
 * routines that can genuinely be discontinued. Food and outcome (symptom/
 * Bristol) items are never auto-archived by inactivity: not eating
 * something, or not having a symptom, for a stretch is meaningful data in
 * its own right, not a sign the item is stale.
 */
const RECENCY_ELIGIBLE_TYPES = new Set<CanonicalEvent["itemType"]>(["habit", "supplement"]);

/**
 * Drops items that are no longer current: either explicitly confirmed
 * (EXPLICITLY_ARCHIVED_ITEMS) or, for habits/supplements only, inferred
 * from having no tracked days in `staleDays` before the most recent date
 * anywhere in the dataset — a proxy for "archived" since the source data
 * has no explicit flag for it (see ARCHIVED_STALE_DAYS). This removes the
 * item's whole history, not just the stale tail, so a discontinued habit
 * doesn't linger in any dashboard, past or present. What got dropped is
 * always returned rather than silently discarded.
 */
export function filterArchivedItems(
  events: CanonicalEvent[],
  staleDays: number = ARCHIVED_STALE_DAYS,
): FilterArchivedResult {
  if (events.length === 0) return { events, archivedItems: [] };

  let globalMaxDate = events[0].date;
  for (const e of events) if (e.date > globalMaxDate) globalMaxDate = e.date;
  const cutoff = new Date(`${globalMaxDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - staleDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const lastDateByItem = new Map<string, string>();
  const typeByItem = new Map<string, CanonicalEvent["itemType"]>();
  for (const e of events) {
    const current = lastDateByItem.get(e.item);
    if (!current || e.date > current) lastDateByItem.set(e.item, e.date);
    if (!typeByItem.has(e.item)) typeByItem.set(e.item, e.itemType);
  }

  const activeItems = new Set<string>();
  const archivedItems: FilterArchivedResult["archivedItems"] = [];
  for (const [item, lastDate] of lastDateByItem) {
    if (EXPLICITLY_ARCHIVED_ITEMS.has(item)) {
      archivedItems.push({ item, lastTrackedDate: lastDate, reason: "explicit" });
      continue;
    }
    const eligibleForRecencyCheck = RECENCY_ELIGIBLE_TYPES.has(typeByItem.get(item)!);
    if (eligibleForRecencyCheck && lastDate < cutoffStr) {
      archivedItems.push({ item, lastTrackedDate: lastDate, reason: "inactivity" });
      continue;
    }
    activeItems.add(item);
  }
  archivedItems.sort((a, b) => b.lastTrackedDate.localeCompare(a.lastTrackedDate));

  return { events: events.filter((e) => activeItems.has(e.item)), archivedItems };
}
