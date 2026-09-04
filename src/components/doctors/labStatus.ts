/** The colour that reads a lab value's range status — shared by the
 * Results tab, the marker detail and the batch-entry view so a low/in/high
 * dot means the same thing everywhere. The status logic itself and
 * `parseNum` are pure and live in `@/lib/aggregations/labs`. */

export { parseNum, rangeStatus, type RangeStatus } from "@/lib/aggregations/labs";
import type { RangeStatus } from "@/lib/aggregations/labs";

export function statusColor(status: RangeStatus): string {
  if (status === "in") return "var(--status-good)";
  if (status === "low" || status === "high") return "var(--status-warning)";
  return "var(--text-muted)";
}
