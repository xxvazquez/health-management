"use client";

import { useRef, useState, type PointerEvent } from "react";
import { DAY, toMs, windowAxis } from "./timeAxis";
import { niceScale } from "./LabMarkerChart";

export interface DailyBucket {
  /** First day of the bucket (a day, a Monday, or the 1st of a month). */
  start: string;
  /** Day after the bucket's last day, clipped to the window. */
  endMs: number;
  startMs: number;
  /** The day's value, or the daily average over the days with a value. */
  value: number;
  kind: "day" | "week" | "month";
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Apple Health's grouping for a daily count: a bar a day up to about a
 * month, a weekly average up to about six months, a monthly average beyond.
 * Days without a value are left out of an average, never counted as zero. */
export function dailyBuckets(points: { date: string; value: number }[], start: string, end: string): DailyBucket[] {
  const minMs = toMs(start);
  const maxMs = toMs(end) + DAY;
  const days = (maxMs - minMs) / DAY;
  const kind: DailyBucket["kind"] = days <= 35 ? "day" : days <= 200 ? "week" : "month";
  const bucketStart = (ms: number) => {
    if (kind === "day") return ms;
    const d = new Date(ms);
    if (kind === "week") return ms - ((d.getUTCDay() + 6) % 7) * DAY;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  };
  const nextStart = (ms: number) => {
    if (kind === "day") return ms + DAY;
    if (kind === "week") return ms + 7 * DAY;
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  };
  const sums = new Map<number, { total: number; n: number }>();
  for (const p of points) {
    const t = toMs(p.date);
    if (t < minMs || t >= maxMs) continue;
    const key = bucketStart(t);
    const cur = sums.get(key) ?? { total: 0, n: 0 };
    sums.set(key, { total: cur.total + p.value, n: cur.n + 1 });
  }
  const buckets: DailyBucket[] = [];
  for (let b = bucketStart(minMs); b < maxMs; b = nextStart(b)) {
    const s = sums.get(b);
    if (!s) continue;
    const startMs = Math.max(b, minMs);
    buckets.push({ start: iso(startMs), startMs, endMs: Math.min(nextStart(b), maxMs), value: Math.round(s.total / s.n), kind });
  }
  return buckets;
}

function windowLabels(minMs: number, maxMs: number): { t: number; text: string }[] {
  const axis = windowAxis(minMs, maxMs - DAY);
  return axis.ticks.map((t) => ({ t, text: axis.format(t) }));
}

/** Every month in the window labelled at its middle, or null below month bars. */
function monthLabels(buckets: DailyBucket[], minMs: number, maxMs: number): { t: number; text: string }[] | null {
  if (buckets[0]?.kind !== "month") return null;
  const out: { t: number; text: string }[] = [];
  const first = new Date(minMs);
  const count = Math.round((maxMs - minMs) / (DAY * 30.44));
  for (let m = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1); m < maxMs; ) {
    const d = new Date(m);
    const next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    const from = Math.max(m, minMs);
    const to = Math.min(next, maxMs);
    // A sliver of a month at either edge would crowd its neighbour's label.
    if (to - from >= DAY * 10) {
      out.push({ t: (from + to) / 2, text: d.toLocaleDateString("en-GB", { month: count > 7 ? "narrow" : "short", timeZone: "UTC" }) });
    }
    m = next;
  }
  return out;
}

/** A daily count (steps) as Apple Health draws it: bars over the chosen
 * window (see `dailyBuckets`), the scale on the right, month or week labels
 * underneath. Dragging a finger or hovering picks a bar and reports it;
 * the others fade back while one is picked. */
export function DailyBarChart({
  buckets,
  start,
  end,
  color,
  onScrub,
  height = 180,
}: {
  buckets: DailyBucket[];
  start: string;
  end: string;
  color: string;
  onScrub: (bucket: DailyBucket | null) => void;
  height?: number;
}) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const minMs = toMs(start);
  const maxMs = toMs(end) + DAY;
  const span = maxMs - minMs;
  const { ceil, ticks } = niceScale(0, Math.max(1, ...buckets.map((b) => b.value)));
  const yWidth = Math.max(36, 14 + 7 * Math.max(...ticks.map((t) => String(t).length)));
  // Month bars get their month under each bar, as in Apple Health's year view.
  const labels = monthLabels(buckets, minMs, maxMs) ?? windowLabels(minMs, maxMs);
  const pct = (ms: number) => ((ms - minMs) / span) * 100;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const rect = plotRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = minMs + ((e.clientX - rect.left) / rect.width) * span;
    let best: DailyBucket | null = null;
    for (const b of buckets) {
      if (!best || Math.abs((b.startMs + b.endMs) / 2 - t) < Math.abs((best.startMs + best.endMs) / 2 - t)) best = b;
    }
    setPicked(best?.start ?? null);
    onScrub(best);
  };
  const clear = () => {
    setPicked(null);
    onScrub(null);
  };

  return (
    <div>
      <div className="flex" style={{ height }}>
        <div
          ref={plotRef}
          className="relative min-w-0 flex-1 border-b"
          style={{ borderColor: "var(--baseline)", touchAction: "pan-y" }}
          onPointerDown={pick}
          onPointerMove={pick}
          onPointerUp={(e) => e.pointerType !== "mouse" && clear()}
          onPointerCancel={clear}
          onPointerLeave={clear}
        >
          {ticks.slice(1).map((t) => (
            <span
              key={t}
              className="absolute inset-x-0 border-t"
              style={{ bottom: `${(t / ceil) * 100}%`, borderColor: "var(--gridline)" }}
              aria-hidden="true"
            />
          ))}
          {buckets.map((b) => {
            const width = pct(b.endMs) - pct(b.startMs);
            return (
              <span
                key={b.start}
                className="absolute bottom-0 rounded-t-[2px]"
                style={{
                  left: `calc(${pct(b.startMs)}% + ${width * 0.15}%)`,
                  width: `max(1px, ${width * 0.7}%)`,
                  height: `${(b.value / ceil) * 100}%`,
                  background: color,
                  opacity: picked && picked !== b.start ? 0.35 : 1,
                }}
              />
            );
          })}
        </div>
        <div className="relative shrink-0 text-xs tabular-nums" style={{ width: yWidth, color: "var(--text-muted)" }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2" style={{ bottom: `${(t / ceil) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
      </div>
      <div className="relative h-5 text-xs" style={{ marginRight: yWidth, color: "var(--text-muted)" }} aria-hidden="true">
        {labels.map(({ t, text }) => (
          <span key={t} className="absolute top-1 -translate-x-1/2 whitespace-nowrap" style={{ left: `${pct(t)}%` }}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
