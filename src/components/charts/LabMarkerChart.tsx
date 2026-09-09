"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";

export interface LabMarkerChartPoint {
  date: string;
  value: number;
}

/** One marker's values over time as a single chronological line. The lab
 * reference range and (where set) the tighter optimal band are shaded
 * behind it; the most recent reading gets an enlarged dot coloured by its
 * status. `windowStart` / `windowEnd` pin the x-axis to the selected time
 * window so it shows every year (or month) in that window even when the
 * readings are sparse — without them the axis just spans the data. */
export function LabMarkerChart({
  data,
  unit,
  refLow,
  refHigh,
  optimalLow = null,
  optimalHigh = null,
  windowStart = null,
  windowEnd = null,
  color = "var(--series-indigo)",
  endColor,
  height = 240,
}: {
  data: LabMarkerChartPoint[];
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  optimalLow?: number | null;
  optimalHigh?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  color?: string;
  endColor?: string;
  height?: number;
}) {
  const rows = data.map((d) => ({ t: toMs(d.date), value: d.value })).sort((a, b) => a.t - b.t);

  const values = rows.map((r) => r.value);
  const bounds = [
    ...values,
    ...(refLow != null ? [refLow] : []),
    ...(refHigh != null ? [refHigh] : []),
    ...(optimalLow != null ? [optimalLow] : []),
    ...(optimalHigh != null ? [optimalHigh] : []),
  ];
  const lo = Math.min(...bounds);
  const hi = Math.max(...bounds);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12;
  const yFloor = lo >= 0 ? Math.max(0, Math.floor(lo - pad)) : Math.floor(lo - pad);
  const yCeil = Math.ceil(hi + pad);

  const dataMin = rows.length ? rows[0].t : 0;
  const dataMax = rows.length ? rows[rows.length - 1].t : 0;
  let minMs = windowStart ? toMs(windowStart) : dataMin;
  let maxMs = windowEnd ? toMs(windowEnd) : dataMax;
  if (maxMs - minMs < DAY * 30) {
    minMs -= DAY * 15;
    maxMs += DAY * 15;
  }
  const axis = windowAxis(minMs, maxMs);
  const last = rows[rows.length - 1] ?? null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: axis.vertical ? 26 : 8, left: 0 }}>
        {refLow != null && refHigh != null && (
          <ReferenceArea y1={refLow} y2={refHigh} fill="var(--series-2)" fillOpacity={0.07} strokeOpacity={0} />
        )}
        {(optimalLow != null || optimalHigh != null) && (
          <ReferenceArea
            y1={optimalLow ?? yFloor}
            y2={optimalHigh ?? yCeil}
            fill="var(--status-good)"
            fillOpacity={0.14}
            strokeOpacity={0}
          />
        )}
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          type="number"
          dataKey="t"
          scale="time"
          domain={[minMs, maxMs]}
          ticks={axis.ticks}
          interval={0}
          tickFormatter={axis.format}
          tickLine={{ stroke: "var(--baseline)" }}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 10 }}
          angle={axis.vertical ? -90 : 0}
          textAnchor={axis.vertical ? "end" : "middle"}
          height={axis.vertical ? 52 : 22}
          tickMargin={axis.vertical ? 2 : 8}
        />
        <YAxis
          domain={[yFloor, yCeil]}
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
          labelFormatter={(label) => tooltipDate(Number(label))}
          formatter={(v) => [unit ? `${v} ${unit}` : String(v), "Value"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={{ r: 1.8, fill: color, strokeWidth: 0 }}
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        {last && (
          <ReferenceDot
            x={last.t}
            y={last.value}
            r={4}
            fill={endColor ?? color}
            stroke="var(--surface-1)"
            strokeWidth={1.5}
          />
        )}
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
