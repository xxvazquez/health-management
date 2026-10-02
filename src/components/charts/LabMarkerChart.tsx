"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAY, toMs, tooltipDate, windowAxis, touchScrub } from "./timeAxis";
import { effectiveRange, rangeStatus } from "@/lib/aggregations/labs";
import { optimalStatusColor } from "@/components/doctors/labStatus";

export interface LabMarkerChartPoint {
  date: string;
  value: number;
}

/** One marker's values over time, drawn the way Apple Health draws a
 * measurement: a straight line through the readings, the lab reference
 * range (and, where set, the tighter optimal band) shaded green behind it,
 * the scale on the right, and dots only where they mean something — on
 * each out-of-range reading (blue low, red high, with `colorByRange`) and
 * a larger one on the latest. `windowStart` / `windowEnd` pin the x-axis
 * to the chosen period so it spans the whole window even when readings are
 * sparse. With `onScrub`, dragging a finger (or hovering) reports the
 * reading under it instead of showing a tooltip box. */
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
  colorByRange = false,
  onScrub,
  height = 220,
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
  colorByRange?: boolean;
  onScrub?: (point: LabMarkerChartPoint | null) => void;
  height?: number;
}) {
  const band = effectiveRange({ refLow, refHigh, optimalLow, optimalHigh });
  const statusOf = (v: number) => rangeStatus(v, band.low, band.high);
  const [touchT, setTouchT] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const rows = data.map((d) => ({ t: toMs(d.date), date: d.date, value: d.value })).sort((a, b) => a.t - b.t);

  const values = rows.map((r) => r.value);
  const bounds = [
    ...values,
    ...(refLow != null ? [refLow] : []),
    ...(refHigh != null ? [refHigh] : []),
    ...(optimalLow != null ? [optimalLow] : []),
    ...(optimalHigh != null ? [optimalHigh] : []),
  ];
  const { floor: yFloor, ceil: yCeil, ticks: yTicks } = niceScale(Math.min(...bounds), Math.max(...bounds));

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
  const lastColor = colorByRange && last ? optimalStatusColor(statusOf(last.value)) : color;

  const scrub = (state: { activeTooltipIndex?: number | string | null }) => {
    const row = rows[Number(state.activeTooltipIndex)];
    onScrub?.(row ? { date: row.date, value: row.value } : null);
  };

  // A finger draws its own line at the picked reading; the library's hover
  // cursor would stay stuck where the finger lifted, so it's off from the
  // first touch until a mouse moves over the chart again.
  const touch = onScrub
    ? touchScrub(rows, minMs, maxMs, (row) => {
        setTouchT(row?.t ?? null);
        setTouched(true);
        onScrub(row ? { date: row.date, value: row.value } : null);
      })
    : undefined;

  return (
    <div {...touch}>
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={rows}
        margin={{ top: 8, right: 0, bottom: 0, left: 14 }}
        onMouseMove={
          onScrub
            ? (state) => {
                setTouched(false);
                scrub(state);
              }
            : undefined
        }
        onMouseLeave={onScrub ? () => onScrub(null) : undefined}
      >
        {refLow != null && refHigh != null && (
          <ReferenceArea y1={refLow} y2={refHigh} fill="var(--band-good)" strokeOpacity={0} />
        )}
        {(optimalLow != null || optimalHigh != null) && (
          <ReferenceArea
            y1={optimalLow ?? yFloor}
            y2={optimalHigh ?? yCeil}
            fill="var(--band-good-strong)"
            strokeOpacity={0}
          />
        )}
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
          domain={[yFloor, yCeil]}
          ticks={yTicks}
          allowDataOverflow
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={36}
        />
        {onScrub ? (
          <Tooltip active={touched ? false : undefined} content={() => null} cursor={{ stroke: "var(--text-secondary)", strokeWidth: 1 }} />
        ) : (
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
        )}
        {touchT != null && <ReferenceLine x={touchT} stroke="var(--text-secondary)" strokeWidth={1} />}
        <Line
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          dot={(props: { cx?: number; cy?: number; value?: number; index?: number }) => {
            const { cx, cy, value, index } = props;
            const status = value != null ? statusOf(value) : null;
            if (!colorByRange || cx == null || cy == null || (status !== "low" && status !== "high")) return <g key={index} />;
            return <circle key={index} cx={cx} cy={cy} r={2.5} fill={optimalStatusColor(status)} />;
          }}
          activeDot={(props: { cx?: number; cy?: number; value?: number; index?: number }) => {
            const { cx, cy, value, index } = props;
            if (cx == null || cy == null) return <g key={index} />;
            const fill = colorByRange && value != null ? optimalStatusColor(statusOf(value)) : color;
            return <circle key={index} cx={cx} cy={cy} r={5} fill={fill} stroke="var(--surface-1)" strokeWidth={2} />;
          }}
          isAnimationActive={false}
        />
        {last && <ReferenceDot x={last.t} y={last.value} r={4.5} fill={lastColor} stroke="var(--surface-1)" strokeWidth={2} />}
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}

/** A y-scale fitted to the readings at their own magnitude: 3–5 ticks on
 * a 1/2/2.5/5 × 10ⁿ step, a little headroom either side, never below 0
 * for non-negative data — so a marker around 0.07 gets 0–0.12, not 0–1. */
export function niceScale(lo: number, hi: number): { floor: number; ceil: number; ticks: number[] } {
  const span = hi - lo || Math.abs(hi) || 1;
  const padded = { lo: lo - span * 0.1, hi: hi + span * 0.1 };
  const rough = (padded.hi - padded.lo) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + (step / magnitude === 2.5 ? 1 : 0));
  const round = (n: number) => Number(n.toFixed(decimals));
  let floor = round(Math.floor(padded.lo / step) * step);
  if (lo >= 0 && floor < 0) floor = 0;
  const ceil = round(Math.ceil(padded.hi / step) * step);
  const ticks: number[] = [];
  for (let t = floor; t <= ceil + step / 2; t += step) ticks.push(round(t));
  return { floor, ceil, ticks };
}

/** Compact inline trend for a marker row — no axes, just the shape of the
 * last handful of values, with the reference band behind it. */
export function LabSparkline({
  values,
  refLow,
  refHigh,
  width = 72,
  height = 24,
  color = "var(--series-indigo)",
}: {
  values: number[];
  refLow: number | null;
  refHigh: number | null;
  width?: number;
  height?: number;
  color?: string;
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
      <path d={path} fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={1.8} fill={color} />
    </svg>
  );
}
