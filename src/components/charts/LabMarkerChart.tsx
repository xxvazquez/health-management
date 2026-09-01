"use client";

import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAxisDate } from "@/lib/aggregations/common";

export interface LabMarkerChartPoint {
  date: string;
  value: number;
}

/** One marker's values over time as a single chronological line, with the
 * reference range shaded — same treatment as BristolScoreChart. The Y
 * domain always includes the reference band so an in-range run still shows
 * where it sits relative to the limits. */
export function LabMarkerChart({
  data,
  unit,
  refLow,
  refHigh,
  color = "var(--series-indigo)",
  height = 240,
}: {
  data: LabMarkerChartPoint[];
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  color?: string;
  height?: number;
}) {
  const values = data.map((d) => d.value);
  const lo = Math.min(...values, refLow ?? Infinity);
  const hi = Math.max(...values, refHigh ?? -Infinity);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        {refLow != null && refHigh != null && (
          <ReferenceArea y1={refLow} y2={refHigh} fill="var(--status-good)" fillOpacity={0.12} strokeOpacity={0} />
        )}
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
          domain={[Math.floor(lo - pad), Math.ceil(hi + pad)]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          width={40}
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
          labelFormatter={(label) => formatAxisDate(String(label))}
          formatter={(v) => [unit ? `${v} ${unit}` : String(v), "Value"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={{ r: 2, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Compact inline trend for a marker row — no axes, just the shape of the
 * last handful of values, with the reference band behind it. */
export function LabSparkline({
  values,
  refLow,
  refHigh,
  width = 72,
  height = 24,
}: {
  values: number[];
  refLow: number | null;
  refHigh: number | null;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values, refLow ?? Infinity);
  const hi = Math.max(...values, refHigh ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 2) + 1;
  const y = (v: number) => height - 1 - ((v - lo) / span) * (height - 2);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const bandY1 = refHigh != null ? y(Math.min(refHigh, hi)) : null;
  const bandY2 = refLow != null ? y(Math.max(refLow, lo)) : null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="shrink-0">
      {bandY1 != null && bandY2 != null && (
        <rect x={0} y={bandY1} width={width} height={Math.max(0, bandY2 - bandY1)} fill="var(--status-good)" fillOpacity={0.14} />
      )}
      <path d={path} fill="none" stroke="var(--series-indigo)" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={1.8} fill="var(--series-indigo)" />
    </svg>
  );
}
