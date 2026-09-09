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

export interface BloodPressurePoint {
  /** ISO timestamp. */
  at: string;
  systolic: number;
  diastolic: number;
  /** The reading's own comment, shown in the tooltip when present. */
  note?: string | null;
}

/** Systolic and diastolic over time, with the ACC/AHA systolic category
 * zones shaded (elevated 120–129, stage 1 130–139, stage 2 140+) and the
 * diastolic stage lines at 80 and 90. Reference only, not a diagnosis.
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
  const bottom = Math.min(...dia, 70) - 6;

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
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: axis.vertical ? 26 : 8, left: 0 }}>
        <ReferenceArea y1={120} y2={130} fill="var(--series-3)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={130} y2={140} fill="var(--status-warning)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={140} y2={top} fill="var(--status-critical)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceLine y={80} stroke="var(--status-warning)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine y={90} stroke="var(--status-critical)" strokeDasharray="3 3" strokeOpacity={0.5} />
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
          domain={[Math.floor(bottom), Math.ceil(top)]}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
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
          dot={{ r: 2.2, fill: "var(--series-magenta)", strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="diastolic"
          stroke="var(--series-2)"
          strokeWidth={1.8}
          dot={{ r: 2.2, fill: "var(--series-2)", strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
