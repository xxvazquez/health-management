"use client";

import { CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";

export interface BristolDot {
  date: string;
  value: number;
}

/** Blue for hard (1–2), green for normal (3–4), red for loose (5–7). */
export function bristolColor(score: number): string {
  if (score <= 2) return "var(--series-2)";
  if (score <= 4) return "var(--status-good)";
  return "var(--status-critical)";
}

/**
 * One dot per Bristol reading on a real time axis across the whole
 * selected window, the 3–4 band shaded green and the 1–7 scale on the
 * right — Apple Health's scatter for a scored measurement.
 */
export function BristolDotChart({ data, start, end, height = 200 }: { data: BristolDot[]; start: string; end: string; height?: number }) {
  const rows = data.map((d) => ({ t: toMs(d.date) + DAY / 2, value: d.value, fill: bristolColor(d.value) }));
  const minMs = toMs(start);
  const maxMs = toMs(end) + DAY;
  const axis = windowAxis(minMs, maxMs);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 0, bottom: 0, left: 4 }}>
        <ReferenceArea y1={2.5} y2={4.5} fill="var(--band-good)" fillOpacity={1} strokeOpacity={0} />
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
          type="number"
          dataKey="value"
          orientation="right"
          domain={[0.5, 7.5]}
          ticks={[1, 2, 3, 4, 5, 6, 7]}
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          width={24}
        />
        <Tooltip
          cursor={false}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
          labelFormatter={() => ""}
          formatter={(v, name) => (name === "t" ? [tooltipDate(Number(v)), "Date"] : [`Type ${v}`, "Bristol"])}
        />
        <Scatter data={rows} isAnimationActive={false} shape="circle">
          {rows.map((r, i) => (
            <Cell key={i} fill={r.fill} />
          ))}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}
