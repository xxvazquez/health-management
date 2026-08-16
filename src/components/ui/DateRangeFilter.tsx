"use client";

import clsx from "clsx";
import type { DateRange } from "@/lib/aggregations/common";
import { addDaysToDate } from "@/lib/aggregations/common";

interface Props {
  span: DateRange;
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS: { label: string; days: number | "all" }[] = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 365 days", days: 365 },
  { label: "All time", days: "all" },
];

export function DateRangeFilter({ span, value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const start = preset.days === "all" ? span.start : addDaysToDate(span.end, -(preset.days - 1));
        const presetRange: DateRange = { start: start < span.start ? span.start : start, end: span.end };
        const active = value.start === presetRange.start && value.end === presetRange.end;
        return (
          <button
            key={preset.label}
            onClick={() => onChange(presetRange)}
            className={clsx("rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors")}
            style={{
              background: active ? "var(--series-1)" : "var(--page-plane)",
              color: active ? "#fff" : "var(--text-secondary)",
            }}
          >
            {preset.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        <input
          type="date"
          value={value.start}
          min={span.start}
          max={value.end}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <span>–</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={span.end}
          onChange={(e) => onChange({ ...value, end: e.target.value })}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      </div>
    </div>
  );
}
