/**
 * Earliest date the analytics layer considers. The source data has an
 * isolated burst of tracking in Nov 2019–Jan 2020 (a different, disconnected
 * period) before tracking resumed in 2026 — excluded here so it doesn't
 * distort coverage/streak/variety metrics for the current tracking period.
 * Raw imported data is untouched in IndexedDB; this only filters what the
 * canonical dataset (and therefore every dashboard) shows.
 */
export const ANALYTICS_START_DATE = "2026-01-01";
