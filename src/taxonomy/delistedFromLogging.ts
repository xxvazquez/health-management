/**
 * Items excluded from the Log page's tappable chip list only — historical
 * log rows and every dashboard/analytics view still include them in full.
 * Distinct from EXPLICITLY_ARCHIVED_ITEMS (archivedOverrides.ts), which also
 * drops an item's history from dashboards; this list only stops new taps.
 * Keyed by canonical item name. Edit this list directly to delist/relist.
 */
export const DELISTED_FROM_LOGGING = new Set<string>([
  "Yellow tongue",
  "Dry mouth",
  "Eating discomfort",
  "Prokit",
  "Amitriptyline",
  "Dicoflor Ibsium",
  "PEA",
  "Maintain the apartment",
]);
