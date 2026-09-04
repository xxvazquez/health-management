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

export interface BloodPressurePoint {
  /** ISO timestamp. */
  at: string;
  systolic: number;
  diastolic: number;
}

function fmtTick(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Systolic and diastolic over time, with the ACC/AHA systolic category
 * zones shaded (elevated 120–129, stage 1 130–139, stage 2 140+) and the
 * diastolic stage lines at 80 and 90. Reference only, not a diagnosis. */
export function BloodPressureChart({ data, height = 240 }: { data: BloodPressurePoint[]; height?: number }) {
  const sys = data.map((d) => d.systolic);
  const dia = data.map((d) => d.diastolic);
  const top = Math.max(...sys, 145) + 8;
  const bottom = Math.min(...dia, 70) - 6;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <ReferenceArea y1={120} y2={130} fill="var(--series-3)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={130} y2={140} fill="var(--status-warning)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceArea y1={140} y2={top} fill="var(--status-critical)" fillOpacity={0.08} strokeOpacity={0} />
        <ReferenceLine y={80} stroke="var(--status-warning)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <ReferenceLine y={90} stroke="var(--status-critical)" strokeDasharray="3 3" strokeOpacity={0.5} />
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="at"
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={fmtTick}
          tickMargin={8}
          minTickGap={28}
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
          labelStyle={{ color: "var(--text-secondary)" }}
          labelFormatter={(label) => fmtTick(String(label))}
          formatter={(v, name) => [`${v} mmHg`, name === "systolic" ? "Systolic" : "Diastolic"]}
        />
        <Line
          type="monotone"
          dataKey="systolic"
          stroke="var(--series-magenta)"
          strokeWidth={1.8}
          dot={{ r: 2.2, fill: "var(--series-magenta)", strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
        <Line
          type="monotone"
          dataKey="diastolic"
          stroke="var(--series-2)"
          strokeWidth={1.8}
          dot={{ r: 2.2, fill: "var(--series-2)", strokeWidth: 0 }}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
