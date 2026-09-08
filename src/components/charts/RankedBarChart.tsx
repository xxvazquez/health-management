"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface RankedBarDatum {
  label: string;
  value: number;
  color?: string;
}

export function RankedBarChart({
  data,
  color = "var(--series-1)",
  valueFormatter,
  height,
}: {
  data: RankedBarDatum[];
  color?: string;
  valueFormatter?: (v: number) => string;
  height?: number;
}) {
  const rowHeight = 28;
  const chartHeight = height ?? Math.max(120, data.length * rowHeight + 20);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={150}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--text-secondary)", fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: "var(--page-plane)" }}
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
          formatter={(v) => (valueFormatter ? valueFormatter(Number(v)) : Number(v))}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={16} label={{ position: "right", fill: "var(--text-secondary)", fontSize: 11 }}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color ?? color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
