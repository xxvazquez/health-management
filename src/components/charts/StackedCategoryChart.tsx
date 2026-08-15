"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { colorForCategorySlot } from "@/taxonomy/categories";

export interface StackedBucket {
  bucketStart: string;
  [category: string]: string | number;
}

export function StackedCategoryChart({
  data,
  categories,
  height = 280,
}: {
  data: StackedBucket[];
  categories: string[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="bucketStart"
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          minTickGap={24}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={28} />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "var(--text-secondary)" }} />
        {categories.map((cat) => (
          <Bar key={cat} dataKey={cat} stackId="cat" fill={colorForCategorySlot(cat)} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
