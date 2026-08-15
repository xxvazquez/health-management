import type { CanonicalEvent } from "@/lib/types";
import { ARCHIVED_STALE_DAYS } from "@/lib/config";

export interface FilterArchivedResult {
  events: CanonicalEvent[];
  /** Items dropped entirely, with the date they were last actually tracked — never silent. */
  archivedItems: { item: string; lastTrackedDate: string }[];
}

/**
 * Drops every event for an item whose last tracked occurrence is more than
 * `staleDays` before the most recent date anywhere in the dataset — a proxy
 * for "no longer current" since the source data has no explicit archived
 * flag (see ARCHIVED_STALE_DAYS). This removes the item's whole history,
 * not just the stale tail, so a discontinued habit doesn't linger in any
 * dashboard, past or present. What got dropped is always returned rather
 * than silently discarded.
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
  for (const e of events) {
    const current = lastDateByItem.get(e.item);
    if (!current || e.date > current) lastDateByItem.set(e.item, e.date);
  }

  const activeItems = new Set<string>();
  const archivedItems: { item: string; lastTrackedDate: string }[] = [];
  for (const [item, lastDate] of lastDateByItem) {
    if (lastDate >= cutoffStr) activeItems.add(item);
    else archivedItems.push({ item, lastTrackedDate: lastDate });
  }
  archivedItems.sort((a, b) => b.lastTrackedDate.localeCompare(a.lastTrackedDate));

  return { events: events.filter((e) => activeItems.has(e.item)), archivedItems };
}
