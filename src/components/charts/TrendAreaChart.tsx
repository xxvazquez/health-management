"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";

export interface TrendPoint {
  date: string;
  value: number;
}

/** One value over time as a softly filled line, drawn the Apple Health
 * way: straight segments, a real time axis with horizontal labels (months
 * or years, from `windowAxis`), and the scale on the right. */
export function TrendAreaChart({
  data,
  color = "var(--series-1)",
  height = 220,
  valueLabel = "Value",
  yTickFormatter,
  showDots = false,
  wholeNumbers = false,
}: {
  data: TrendPoint[];
  color?: string;
  height?: number;
  valueLabel?: string;
  /** Formats each y-axis tick (e.g. appending a unit like "kg"). */
  yTickFormatter?: (value: number) => string;
  /** Mark each data point — for sparse, individually meaningful series
   * (e.g. one dot per logged session) where the reader should be able to
   * tell "how many observations" from the line itself. */
  showDots?: boolean;
  /** Counts (sessions, days): whole-number ticks only, never 0.75. */
  wholeNumbers?: boolean;
}) {
  // Must be a valid SVG id with no characters that could break a url(#id)
  // reference (parens, slashes, etc. from a label like "Unique foods (7d)").
  const gradientId = `trend-gradient-${valueLabel.replace(/[^a-zA-Z0-9]+/g, "-")}`;
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
      <AreaChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 14 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.22} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
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
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          tickFormatter={yTickFormatter}
          allowDecimals={!wholeNumbers}
          width={yTickFormatter ? 60 : 36}
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
          formatter={(v) => [Number(v), valueLabel]}
        />
        <Area
          type="linear"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          fill={`url(#${gradientId})`}
          dot={showDots ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 4.5, stroke: "var(--surface-1)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
