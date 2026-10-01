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

/** Most year labels a phone-width chart fits side by side. */
const MAX_YEAR_LABELS = 6;

/** Ticks for the whole selected window, not just where readings land —
 * always horizontal, the way Apple Health labels its charts: up to about
 * seven weeks a tick a week ("8 Sept", "15"…; a tick a day within ten
 * days), up to about seven months a tick per month reading "Sep", up to about 14 months one
 * per month as its initial ("J F M…"), and beyond that one per year
 * ("2019"), labelling every n-th year when there are too many to fit. A
 * January tick in the month views shows its year instead, so the turn of
 * the year stays readable. */
export function windowAxis(minMs: number, maxMs: number): { ticks: number[]; format: (ms: number) => string } {
  const days = (maxMs - minMs) / DAY;
  if (days <= 50) {
    // A tick a day for a week, else a tick a week, read as "8 Sept", "15", "22"…
    const step = days <= 10 ? 1 : 7;
    const ticks: number[] = [];
    // Weekly ticks stay a couple of days in from both edges so no label is clipped.
    const first = Math.ceil(minMs / DAY) * DAY + (step === 7 ? DAY * 2 : 0);
    for (let t = first; t <= maxMs - (step === 7 ? DAY * 2 : 0); t += DAY * step) ticks.push(t);
    return {
      ticks,
      format: (ms) => {
        const d = new Date(ms);
        const prev = new Date(ms - DAY * step);
        const showMonth = ms === ticks[0] || prev.getUTCMonth() !== d.getUTCMonth();
        return showMonth ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : String(d.getUTCDate());
      },
    };
  }
  const months = (maxMs - minMs) / (DAY * 30.44);
  if (months <= 14) {
    const first = new Date(minMs);
    let cur = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
    if (cur < minMs) cur = Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1);
    const ticks: number[] = [];
    while (cur <= maxMs) {
      ticks.push(cur);
      const c = new Date(cur);
      cur = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    }
    const short = months <= 7.5;
    return {
      ticks,
      format: (ms) => {
        const d = new Date(ms);
        if (d.getUTCMonth() === 0 && short) return String(d.getUTCFullYear());
        const name = d.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
        return short ? name : name.charAt(0);
      },
    };
  }
  const ticks: number[] = [];
  for (let y = new Date(minMs).getUTCFullYear(); y <= new Date(maxMs).getUTCFullYear(); y++) {
    const t = Date.UTC(y, 0, 1);
    if (t >= minMs && t <= maxMs) ticks.push(t);
  }
  const step = Math.ceil(ticks.length / MAX_YEAR_LABELS);
  const labelled = new Set(ticks.filter((_, i) => (ticks.length - 1 - i) % step === 0));
  return { ticks, format: (ms) => (labelled.has(ms) ? String(new Date(ms).getUTCFullYear()) : "") };
}

/** The row nearest to time `t`, or null for no rows. */
export function nearestByTime<T extends { t: number }>(rows: readonly T[], t: number): T | null {
  let best: T | null = null;
  for (const r of rows) if (!best || Math.abs(r.t - t) < Math.abs(best.t - t)) best = r;
  return best;
}

/** Touch handlers for the element around a time chart: a finger on the chart
 * picks the reading nearest it along the time axis (`minMs`–`maxMs` across
 * the plot area), lifting it clears the pick. Worked out from the finger's
 * own position rather than the chart library's hover state, which updates a
 * frame late on touch. */
export function touchScrub<T extends { t: number }>(rows: readonly T[], minMs: number, maxMs: number, onPick: (row: T | null) => void) {
  const pick = (e: { touches: { length: number; [i: number]: { clientX: number } }; currentTarget: Element }) => {
    const touch = e.touches[0];
    if (!touch) return;
    const plot = e.currentTarget.querySelector(".recharts-cartesian-grid") ?? e.currentTarget;
    const r = plot.getBoundingClientRect();
    if (!r.width) return;
    const f = Math.min(1, Math.max(0, (touch.clientX - r.left) / r.width));
    onPick(nearestByTime(rows, minMs + f * (maxMs - minMs)));
  };
  const clear = () => onPick(null);
  return { onTouchStart: pick, onTouchMove: pick, onTouchEnd: clear, onTouchCancel: clear };
}
