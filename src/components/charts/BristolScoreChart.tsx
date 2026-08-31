"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxisDate } from "@/lib/aggregations/common";

export interface BristolScoreChartPoint {
  date: string;
  value: number;
}

/**
 * The Bristol score as ONE chronological line (1–5), with the 3–4 target
 * range shaded rather than split into separate series — an ordinal scale
 * belongs on one axis, not one line per value. Same-day multiple readings
 * simply appear as separate points at the same x position, which is what
 * makes the chart show them transparently instead of inventing a merged
 * value.
 */
export function BristolScoreChart({ data, color = "var(--series-1)", height = 280 }: { data: BristolScoreChartPoint[]; color?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 0 }}>
        <ReferenceArea y1={3} y2={4} fill="var(--status-good)" fillOpacity={0.12} strokeOpacity={0} />
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={formatAxisDate}
          tickMargin={8}
          minTickGap={28}
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          width={32}
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
          formatter={(v) => [`Bristol ${v}`, "Score"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={{ r: 1.5, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
