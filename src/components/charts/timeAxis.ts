/** Shared time-axis helpers for the trend charts — a fixed set of ticks
 * across a chosen window (every month, or every year for long spans) so a
 * chart shows the whole window even when the readings in it are sparse. */

export const DAY = 86_400_000;

/** ISO date (or timestamp) → epoch ms at UTC midnight of that day. */
export function toMs(date: string): number {
  return Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
}

export function tooltipDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Most horizontal tick labels a phone-width chart fits side by side. */
const MAX_LABELS = 7;
/** Most vertical month labels before ticks step further apart. */
const MAX_VERTICAL = 22;
/** Month steps a long window can use, so ticks land on regular months. */
const MONTH_STEPS = [1, 2, 3, 4, 6, 12, 24];

function monthShort(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

/** Ticks for the whole selected window, not just where readings land.
 * Up to a year: one tick per month reading "Sep", January shown as its
 * year, labels horizontal (every n-th one past `MAX_LABELS`). Longer: a
 * tick every 1–24 months on regular months (Jan, Apr, Jul, Oct for a
 * three-month step), each labelled "Jan 17" and turned vertical so many
 * fit without overlapping. */
export function windowAxis(minMs: number, maxMs: number): { ticks: number[]; format: (ms: number) => string; vertical: boolean } {
  const months = (maxMs - minMs) / (DAY * 30.44);
  const first = new Date(minMs);
  const startIndex = first.getUTCFullYear() * 12 + first.getUTCMonth() + (Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1) < minMs ? 1 : 0);
  const monthStarts = (step: number) => {
    const ticks: number[] = [];
    for (let m = Math.ceil(startIndex / step) * step; ; m += step) {
      const t = Date.UTC(Math.floor(m / 12), m % 12, 1);
      if (t > maxMs) break;
      ticks.push(t);
    }
    return ticks;
  };

  if (months <= 12.5) {
    const ticks = monthStarts(1);
    const step = Math.ceil(ticks.length / MAX_LABELS);
    const labelled = new Set(ticks.filter((_, i) => i % step === 0));
    const label = (ms: number) => (new Date(ms).getUTCMonth() === 0 ? String(new Date(ms).getUTCFullYear()) : monthShort(ms));
    return { ticks, format: (ms) => (labelled.has(ms) ? label(ms) : ""), vertical: false };
  }

  const step = MONTH_STEPS.find((n) => months / n <= MAX_VERTICAL) ?? 24;
  const ticks = monthStarts(step);
  return {
    ticks,
    format: (ms) => `${monthShort(ms)} ${String(new Date(ms).getUTCFullYear()).slice(-2)}`,
    vertical: true,
  };
}
