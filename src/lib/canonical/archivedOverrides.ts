/**
 * Habits explicitly confirmed as no longer current, beyond what the
 * recency heuristic in filterArchivedItems.ts catches on its own (either
 * because they're still within the staleness window, or because the
 * heuristic doesn't apply to their item type). Keyed by canonical item
 * name. Edit this list directly to archive/unarchive a specific item.
 */
export const EXPLICITLY_ARCHIVED_ITEMS = new Set<string>([
  "Breakfast",
  "Lunch",
  "Dinner",
  "Eat balanced meals",
  "Eat enough protein",
  "Eat out",
  "Rest and recover",
  "Drink water first thing in the morning",
  "Learning",
  "Learn something",
  "Be present with Andrzej",
  "Thick phlegm (mad)",
  "Thick phlegm (mbe)",
  "Maintain the apartment",
]);
