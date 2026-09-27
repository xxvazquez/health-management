"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { DAY, toMs, tooltipDate, windowAxis, touchScrub } from "./timeAxis";
import { BP_LOW_DIASTOLIC, BP_LOW_SYSTOLIC } from "@/lib/aggregations/vitals";

const LOW = "var(--series-2)";
const HIGH = "var(--status-critical)";
const SYSTOLIC = "var(--text-secondary)";
const DIASTOLIC = "var(--series-other)";

export interface BloodPressurePoint {
  /** ISO timestamp. */
  at: string;
  systolic: number;
  diastolic: number;
  /** The reading's own comment. */
  note?: string | null;
}

/** Blue below the low threshold, red at or above the high one, none in between. */
function statusDot(low: number, high: number) {
  function Dot({ cx, cy, value, index }: { cx?: number; cy?: number; value?: number; index?: number }) {
    if (cx == null || cy == null || value == null || (value >= low && value < high)) return <g key={index} />;
    return <circle key={index} cx={cx} cy={cy} r={2.75} fill={value < low ? LOW : HIGH} />;
  }
  return Dot;
}

/** Systolic (darker line) and diastolic (lighter line) over time, drawn
 * the way Apple Health draws a measurement: straight lines, the scale on
 * the right, and colour only where it means something. Each line has its
 * normal band shaded green (systolic 90–119, diastolic 60–79); below
 * diastolic 60 is shaded blue for low, and systolic 130+ faintly amber then
 * red. A dot marks each low (blue) or high (red, systolic 140+ / diastolic
 * 90+) reading. Reference only, not a diagnosis. `windowStart` /
 * `windowEnd` pin the x-axis to the chosen period. With `onScrub`,
 * dragging a finger (or hovering) reports the reading under it. */
export function BloodPressureChart({
  data,
  windowStart = null,
  windowEnd = null,
  onScrub,
  height = 220,
}: {
  data: BloodPressurePoint[];
  windowStart?: string | null;
  windowEnd?: string | null;
  onScrub?: (point: BloodPressurePoint | null) => void;
  height?: number;
}) {
  const [touchT, setTouchT] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const rows = data
    .map((d) => ({ t: toMs(d.at), at: d.at, systolic: d.systolic, diastolic: d.diastolic, note: d.note }))
    .sort((a, b) => a.t - b.t);

  const sys = rows.map((d) => d.systolic);
  const dia = rows.map((d) => d.diastolic);
  const top = Math.max(...sys, 145) + 8;
  const bottom = Math.min(...dia, BP_LOW_DIASTOLIC - 4) - 4;

  const dataMin = rows.length ? rows[0].t : 0;
  const dataMax = rows.length ? rows[rows.length - 1].t : 0;
  let minMs = windowStart ? toMs(windowStart) : dataMin;
  let maxMs = windowEnd ? toMs(windowEnd) : dataMax;
  if (maxMs - minMs < DAY * 30) {
    minMs -= DAY * 15;
    maxMs += DAY * 15;
  }
  const axis = windowAxis(minMs, maxMs);
  // Round, meaningful gridlines — the low and normal thresholds — rather
  // than whatever the data's extremes divide into.
  const yTicks = [40, 60, 90, 120, 140, 160, 180, 200].filter((t) => t >= bottom && t <= top);

  const scrub = (state: { activeTooltipIndex?: number | string | null }) => {
    const row = rows[Number(state.activeTooltipIndex)];
    onScrub?.(row ? { at: row.at, systolic: row.systolic, diastolic: row.diastolic, note: row.note } : null);
  };
  const activeDot = (color: string) =>
    function ActiveDot({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
      if (cx == null || cy == null) return <g key={index} />;
      return <circle key={index} cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--surface-1)" strokeWidth={2} />;
    };

  // A finger draws its own line at the picked reading; the library's hover
  // cursor would stay stuck where the finger lifted, so it's off from the
  // first touch until a mouse moves over the chart again.
  const touch = onScrub
    ? touchScrub(rows, minMs, maxMs, (row) => {
        setTouchT(row?.t ?? null);
        setTouched(true);
        onScrub(row ? { at: row.at, systolic: row.systolic, diastolic: row.diastolic, note: row.note } : null);
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
        <ReferenceArea y1={Math.floor(bottom)} y2={BP_LOW_DIASTOLIC} fill={LOW} fillOpacity={0.14} strokeOpacity={0} />
        <ReferenceArea y1={BP_LOW_DIASTOLIC} y2={80} fill="var(--status-good)" fillOpacity={0.18} strokeOpacity={0} />
        <ReferenceArea y1={BP_LOW_SYSTOLIC} y2={120} fill="var(--status-good)" fillOpacity={0.18} strokeOpacity={0} />
        <ReferenceArea y1={130} y2={140} fill="var(--status-warning)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={140} y2={Math.ceil(top)} fill={HIGH} fillOpacity={0.08} strokeOpacity={0} />
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
          domain={[Math.floor(bottom), Math.ceil(top)]}
          ticks={yTicks}
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
            labelStyle={{ color: "var(--text-secondary)", maxWidth: 200, whiteSpace: "normal" }}
            labelFormatter={(label) => tooltipDate(Number(label))}
            formatter={(v, name) => [`${v} mmHg`, name === "systolic" ? "Systolic" : "Diastolic"]}
          />
        )}
        {touchT != null && <ReferenceLine x={touchT} stroke="var(--text-secondary)" strokeWidth={1} />}
        <Line
          type="linear"
          dataKey="systolic"
          stroke={SYSTOLIC}
          strokeWidth={1.75}
          dot={statusDot(BP_LOW_SYSTOLIC, 140)}
          activeDot={activeDot(SYSTOLIC)}
          isAnimationActive={false}
        />
        <Line
          type="linear"
          dataKey="diastolic"
          stroke={DIASTOLIC}
          strokeWidth={1.75}
          dot={statusDot(BP_LOW_DIASTOLIC, 90)}
          activeDot={activeDot(DIASTOLIC)}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
}
