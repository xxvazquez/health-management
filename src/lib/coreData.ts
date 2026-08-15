/**
 * Date helpers for the app's Core Data (SQLite) export.
 *
 * Two different epoch schemes show up in the source data:
 *  - ZFORDAY columns are plain Unix epoch day numbers (days since 1970-01-01 UTC).
 *    This is the authoritative field for "which calendar day is this row for" —
 *    it's timezone-stable, unlike ZDATE which is often stamped near a local
 *    midnight boundary and can drift a day depending on the device's timezone.
 *  - ZCREATEDATE / ZUPDATEDATE / ZDATE columns are Core Data timestamps: seconds
 *    since 2001-01-01T00:00:00Z.
 */

const CORE_DATA_EPOCH_OFFSET_SECONDS = 978307200; // 2001-01-01T00:00:00Z minus Unix epoch

export function epochDayToISODate(forDay: number): string {
  return new Date(forDay * 86400 * 1000).toISOString().slice(0, 10);
}

export function coreDataSecondsToISODate(seconds: number): string {
  return new Date((seconds + CORE_DATA_EPOCH_OFFSET_SECONDS) * 1000)
    .toISOString()
    .slice(0, 10);
}

export function coreDataSecondsToTimestamp(seconds: number): number {
  return (seconds + CORE_DATA_EPOCH_OFFSET_SECONDS) * 1000;
}
