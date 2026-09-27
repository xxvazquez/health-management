"use client";

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
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";
import { BP_LOW_DIASTOLIC, BP_LOW_SYSTOLIC } from "@/lib/aggregations/vitals";

const LOW = "var(--series-6)";

/** A reading's dot — enlarged and ringed in the low colour when that value
 * is under its low threshold, so low readings stand out on the line. */
function lowDot(color: string, threshold: number) {
  function Dot({ cx, cy, value, index }: { cx?: number; cy?: number; value?: number; index?: number }) {
    if (cx == null || cy == null) return <g key={index} />;
    const low = value != null && value < threshold;
    return low ? (
      <circle key={index} cx={cx} cy={cy} r={4} fill={LOW} stroke="var(--surface-1)" strokeWidth={1.5} />
    ) : (
      <circle key={index} cx={cx} cy={cy} r={2.2} fill={color} />
    );
  }
  return Dot;
}

export interface BloodPressurePoint {
  /** ISO timestamp. */
  at: string;
  systolic: number;
  diastolic: number;
  /** The reading's own comment, shown in the tooltip when present. */
  note?: string | null;
}

/** Systolic and diastolic over time. Low blood pressure is marked most
 * clearly: a shaded zone under diastolic 60, a dashed line at systolic 90,
 * and enlarged dots on any reading under either. The ACC/AHA systolic zones
 * are shaded faintly above (elevated 120–129, stage 1 130–139, stage 2
 * 140+). Reference only, not a diagnosis.
 * `windowStart` / `windowEnd` pin the x-axis to the selected window so it
 * shows every month (or year) in it even when readings are sparse. */
export function BloodPressureChart({
  data,
  windowStart = null,
  windowEnd = null,
  height = 240,
}: {
  data: BloodPressurePoint[];
  windowStart?: string | null;
  windowEnd?: string | null;
  height?: number;
}) {
  const rows = data
    .map((d) => ({ t: toMs(d.at), systolic: d.systolic, diastolic: d.diastolic, note: d.note }))
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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <ReferenceArea y1={120} y2={130} fill="var(--series-3)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={130} y2={140} fill="var(--status-warning)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={140} y2={top} fill="var(--status-critical)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={Math.floor(bottom)} y2={BP_LOW_DIASTOLIC} fill={LOW} fillOpacity={0.18} strokeOpacity={0} />
        <ReferenceLine y={BP_LOW_SYSTOLIC} stroke={LOW} strokeDasharray="4 3" strokeOpacity={0.8} />
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
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          height={22}
          tickMargin={8}
        />
        <YAxis
          domain={[Math.floor(bottom), Math.ceil(top)]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={34}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
          labelStyle={{ color: "var(--text-secondary)", maxWidth: 200, whiteSpace: "normal" }}
          labelFormatter={(label, payload) => {
            const note = (payload?.[0]?.payload as { note?: string | null } | undefined)?.note;
            const when = tooltipDate(Number(label));
            return note ? `${when} — ${note}` : when;
          }}
          formatter={(v, name) => [`${v} mmHg`, name === "systolic" ? "Systolic" : "Diastolic"]}
        />
        <Line
          type="monotone"
          dataKey="systolic"
          stroke="var(--series-magenta)"
          strokeWidth={1.8}
          dot={lowDot("var(--series-magenta)", BP_LOW_SYSTOLIC)}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="diastolic"
          stroke="var(--series-2)"
          strokeWidth={1.8}
          dot={lowDot("var(--series-2)", BP_LOW_DIASTOLIC)}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
