"use client";

export interface ColorStripPoint {
  date: string;
  color: string;
  title: string;
}

/** A horizontal strip of colored marks, one per data point — for ordinal/categorical day-level timelines. */
export function ColorStrip({ points }: { points: ColorStripPoint[] }) {
  if (points.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-[3px]">
      {points.map((p, i) => (
        <div
          key={`${p.date}-${i}`}
          title={p.title}
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ background: p.color }}
        />
      ))}
    </div>
  );
}
