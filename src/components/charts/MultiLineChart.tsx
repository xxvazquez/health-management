"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  label: string;
  color: string;
}

/** Click a legend entry to hide/show that series — useful once there are
 * more than a couple of lines and the overlap gets hard to read. */
export function MultiLineChart({
  data,
  series,
  height = 220,
}: {
  data: Record<string, string | number>[];
  series: Series[];
  height?: number;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, bottom: 28, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--gridline)" />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={{ stroke: "var(--baseline)" }}
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          tickFormatter={(d: string) => d.slice(2)}
          angle={-90}
          textAnchor="end"
          height={56}
          minTickGap={12}
        />
        <YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={32} />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, cursor: "pointer" }}
          onClick={(entry) => {
            const key = entry?.dataKey;
            if (key !== undefined) toggle(String(key));
          }}
          formatter={(value, entry) => {
            const key = (entry as { dataKey?: string | number })?.dataKey;
            const isHidden = key !== undefined && hidden.has(String(key));
            return (
              <span style={{ color: isHidden ? "var(--text-muted)" : "var(--text-secondary)", textDecoration: isHidden ? "line-through" : "none" }}>
                {value}
              </span>
            );
          }}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            hide={hidden.has(s.key)}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
