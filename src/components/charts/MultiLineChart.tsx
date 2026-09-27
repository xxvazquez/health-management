"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DAY, toMs, tooltipDate, windowAxis } from "./timeAxis";

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

  const rows = data.map((d) => ({ ...d, t: toMs(String(d.date)) })).sort((a, b) => a.t - b.t);
  let minMs = rows[0]?.t ?? 0;
  let maxMs = rows[rows.length - 1]?.t ?? 0;
  if (maxMs - minMs < DAY * 30) {
    minMs -= DAY * 15;
    maxMs += DAY * 15;
  }
  const axis = windowAxis(minMs, maxMs);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: 14 }}>
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
        <YAxis orientation="right" tickLine={false} axisLine={false} tick={{ fill: "var(--text-muted)", fontSize: 12 }} width={36} />
        <Tooltip
          contentStyle={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-hairline)",
            borderRadius: 8,
            fontSize: 12,
            color: "var(--text-primary)",
          }}
          labelFormatter={(label) => tooltipDate(Number(label))}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, cursor: "pointer", paddingTop: 14 }}
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
            type="linear"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            hide={hidden.has(s.key)}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
