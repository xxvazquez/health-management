/**
 * Earliest date the analytics layer considers. The source data has an
 * isolated burst of tracking in Nov 2019–Jan 2020 (a different, disconnected
 * period) before tracking resumed in 2026 — excluded here so it doesn't
 * distort coverage/streak/variety metrics for the current tracking period.
 * Raw imported data is untouched in IndexedDB; this only filters what the
 * canonical dataset (and therefore every dashboard) shows.
 */
export const ANALYTICS_START_DATE = "2026-01-01";

/**
 * The source export has no explicit "archived" flag on a habit (ZISREMOVED
 * is 0 for every habit, even ones that are clearly no longer in use, like
 * an old "Dinner" time-log habit superseded by a newer "Finish dinner by
 * 21:00" goal habit). As a proxy: an item with zero tracked days in this
 * many days before the most recent date in the data is treated as
 * discontinued and excluded from the dataset entirely, not just from a
 * filtered date range.
 */
export const ARCHIVED_STALE_DAYS = 90;
