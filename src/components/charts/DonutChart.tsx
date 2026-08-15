"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({ data, height = 220 }: { data: DonutDatum[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex items-center gap-6">
      <ResponsiveContainer width={height} height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="95%"
            paddingAngle={2}
            stroke="var(--surface-1)"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-hairline)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-primary)",
            }}
            formatter={(value, name) => {
              const n = Number(value);
              return [`${n} (${Math.round((n / total) * 100)}%)`, String(name)];
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ul className="flex flex-col gap-2">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span style={{ color: "var(--text-secondary)" }}>{d.label}</span>
            <span className="ml-auto tabular-nums font-medium" style={{ color: "var(--text-primary)" }}>
              {total > 0 ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
