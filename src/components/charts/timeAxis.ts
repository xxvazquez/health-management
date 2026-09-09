/** Shared time-axis helpers for the trend charts — a fixed set of ticks
 * across a chosen window (every month, or every year for long spans) so a
 * chart shows the whole window even when the readings in it are sparse. */

export const DAY = 86_400_000;

/** ISO date (or timestamp) → epoch ms at UTC midnight of that day. */
export function toMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

export function monthAxisLabel(ms: number): string {
  const d = new Date(ms);
  const mon = d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  return `${mon} ${String(d.getUTCFullYear()).slice(-2)}`;
}

export function tooltipDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Ticks for the whole selected window, not just where readings land — one
 * per month up to ~2.5 years, one per year beyond that. Labels turn
 * vertical past six ticks, so a long span shows every tick without them
 * overlapping. */
export function windowAxis(minMs: number, maxMs: number): { ticks: number[]; format: (ms: number) => string; vertical: boolean } {
  const months = (maxMs - minMs) / (DAY * 30.44);
  const ticks: number[] = [];
  if (months <= 30) {
    const d = new Date(minMs);
    let cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (cur < minMs) cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    while (cur <= maxMs) {
      ticks.push(cur);
      const c = new Date(cur);
      cur = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    return { ticks, format: monthAxisLabel, vertical: ticks.length > 6 };
  }
  const startYear = new Date(minMs).getUTCFullYear();
  const endYear = new Date(maxMs).getUTCFullYear();
  for (let y = startYear; y <= endYear; y++) {
    const t = Date.UTC(y, 0, 1);
    if (t >= minMs && t <= maxMs) ticks.push(t);
  }
  return { ticks, format: (ms) => String(new Date(ms).getUTCFullYear()), vertical: ticks.length > 6 };
}
