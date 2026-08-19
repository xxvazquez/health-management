"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface TrendPoint {
  date: string;
  value: number;
}

export function TrendAreaChart({
  data,
  color = "var(--series-1)",
  height = 220,
  valueLabel = "Value",
  xTickFormatter,
  yTickFormatter,
  showEveryTick = false,
  linear = false,
  showDots = false,
}: {
  data: TrendPoint[];
  color?: string;
  height?: number;
  valueLabel?: string;
  /** Formats each x-axis tick (e.g. a raw date into a month name) without changing the underlying data. */
  xTickFormatter?: (value: string) => string;
  /** Formats each y-axis tick (e.g. appending a unit like "kg"). */
  yTickFormatter?: (value: number) => string;
  /** Force every data point to get its own x-axis tick, instead of Recharts thinning them for space — for charts with few, already-meaningful points (e.g. one per month) where dropping any would hide real data from view. */
  showEveryTick?: boolean;
  /** Straight segment-to-segment lines instead of a smoothed curve — for
   * charts where the curve's job is to show exactly what was logged (e.g.
   * one point per real session), not an aggregate trend where a smoothed
   * shape reads more naturally. */
  linear?: boolean;
  /** Mark each data point — for sparse, individually meaningful series
   * (e.g. one dot per logged session) where the reader should be able to
   * tell "how many observations" from the line itself. */
  showDots?: boolean;
}) {
  // Must be a valid SVG id with no characters that could break a url(#id)
  // reference (parens, slashes, etc. from a label like "Unique foods (7d)").
  const gradientId = `trend-gradient-${valueLabel.replace(/[^a-zA-Z0-9]+/g, "-")}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 20, bottom: 28, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={xTickFormatter ?? ((d: string) => d.slice(2))}
          angle={-90}
          textAnchor="end"
          height={56}
          minTickGap={12}
          interval={showEveryTick ? 0 : "preserveEnd"}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={yTickFormatter}
          width={yTickFormatter ? 44 : 32}
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
          formatter={(v) => [Number(v), valueLabel]}
        />
        <Area
          type={linear ? "linear" : "monotone"}
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={showDots ? { r: 3, fill: color, stroke: "var(--surface-1)", strokeWidth: 1 } : false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
