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

/** Most tick labels a phone-width chart fits side by side. */
const MAX_LABELS = 7;

/** Ticks for the whole selected window, not just where readings land — one
 * per month up to ~2.5 years, one per year beyond that. Months read "Sep",
 * with January shown as its year ("2027") so year boundaries stay clear.
 * Every tick keeps its mark, but past `MAX_LABELS` only every n-th one is
 * labelled, so labels stay horizontal and never overlap. */
export function windowAxis(minMs: number, maxMs: number): { ticks: number[]; format: (ms: number) => string } {
  const months = (maxMs - minMs) / (DAY * 30.44);
  const ticks: number[] = [];
  let label: (ms: number) => string;
  if (months <= 30) {
    const d = new Date(minMs);
    let cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    if (cur < minMs) cur = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    while (cur <= maxMs) {
      ticks.push(cur);
      const c = new Date(cur);
      cur = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    label = (ms) => {
      const d = new Date(ms);
      return d.getUTCMonth() === 0 ? String(d.getUTCFullYear()) : d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    };
  } else {
    const startYear = new Date(minMs).getUTCFullYear();
    const endYear = new Date(maxMs).getUTCFullYear();
    for (let y = startYear; y <= endYear; y++) {
      const t = Date.UTC(y, 0, 1);
      if (t >= minMs && t <= maxMs) ticks.push(t);
    }
    label = (ms) => String(new Date(ms).getUTCFullYear());
  }
  const step = Math.ceil(ticks.length / MAX_LABELS);
  const labelled = new Set(ticks.filter((_, i) => i % step === 0));
  return { ticks, format: (ms) => (labelled.has(ms) ? label(ms) : "") };
}
