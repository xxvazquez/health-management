"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";

export interface BristolScoreChartPoint {
  date: string;
  value: number;
}

/**
 * The Bristol score (1–7) as ONE chronological line, with the 3–4 target
 * range shaded green rather than split into separate series — an ordinal
 * scale belongs on one axis, not one line per value. Drawn the Apple Health
 * way: straight segments, a real time axis with horizontal labels, the
 * scale on the right. Same-day readings appear as separate points at the
 * same x position rather than an invented merged value.
 */
export function BristolScoreChart({ data, color = "var(--series-1)", height = 240 }: { data: BristolScoreChartPoint[]; color?: string; height?: number }) {
  const rows = data.map((d) => ({ t: toMs(d.date), value: d.value })).sort((a, b) => a.t - b.t);
  let minMs = rows[0]?.t ?? 0;
  let maxMs = rows[rows.length - 1]?.t ?? 0;
  if (maxMs - minMs < DAY * 30) {
    minMs -= DAY * 15;
    maxMs += DAY * 15;
  }
  const axis = windowAxis(minMs, maxMs);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 14 }}>
        <ReferenceArea y1={3} y2={4} fill="var(--status-good)" fillOpacity={0.18} strokeOpacity={0} />
        <CartesianGrid vertical={false} stroke="var(--gridline)" strokeOpacity={0.7} />
        <XAxis
          type="number"
          dataKey="t"
          scale="time"
          domain={[minMs, maxMs]}
          ticks={axis.ticks}
          interval={0}
          tickFormatter={axis.format}
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          height={24}
          tickMargin={6}
        />
        <YAxis
          orientation="right"
          domain={[1, 7]}
          ticks={[1, 2, 3, 4, 5, 6, 7]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={28}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
          labelStyle={{ color: "var(--text-secondary)" }}
          labelFormatter={(label) => tooltipDate(Number(label))}
          formatter={(v) => [`Bristol ${v}`, "Score"]}
        />
        <Line
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={{ r: 1.75, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4.5, fill: color, stroke: "var(--surface-1)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
