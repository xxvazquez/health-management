/** Where a lab value sits against its marker's reference range, and the
 * colour that reads it — shared by the Results tab, the marker detail and
 * the batch-entry view so a low/in/high dot means the same thing
 * everywhere. */

export type RangeStatus = "low" | "in" | "high" | null;

export function rangeStatus(value: number, low: number | null, high: number | null): RangeStatus {
  if (low == null && high == null) return null;
  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "in";
}

export function statusColor(status: RangeStatus): string {
  if (status === "in") return "var(--status-good)";
  if (status === "low" || status === "high") return "var(--status-warning)";
  return "var(--text-muted)";
}

/** Parse a typed measurement — accepts a comma or dot decimal separator,
 * returns null for anything not a finite number. */
export function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}
