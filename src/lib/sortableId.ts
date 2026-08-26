/**
 * A `crypto.randomUUID()` alternative whose first 48 bits are the creation
 * timestamp (ms since epoch) instead of random data — still a valid v7 UUID,
 * so it drops into any existing `uuid` column unchanged, but two ids now
 * compare in creation order via plain string comparison. Used for the
 * timeline's log/stool/workout rows: their own timestamp (`updatedAt`/
 * `loggedAt`) is only minute-precision by design (see the Log page's sticky
 * time picker), so entries logged in the same minute need this as the
 * secondary sort key to land in the order they were actually added instead
 * of whatever order they happen to come back from IndexedDB/Supabase in.
 */
export function createTimeOrderedId(): string {
  const ts = Date.now();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const tsHigh = Math.floor(ts / 0x100000000);
  const tsLow = ts >>> 0;
  bytes[0] = (tsHigh >>> 8) & 0xff;
  bytes[1] = tsHigh & 0xff;
  bytes[2] = (tsLow >>> 24) & 0xff;
  bytes[3] = (tsLow >>> 16) & 0xff;
  bytes[4] = (tsLow >>> 8) & 0xff;
  bytes[5] = tsLow & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
