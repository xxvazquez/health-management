"use client";

import { useState } from "react";
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
  { label: "Last 2 years", days: 730 },
  { label: "All time", days: "all" },
];

/**
 * Which preset reads as "active" is tracked by which button was actually
 * clicked, not by comparing ranges — with a short dataset, several presets
 * (90 days, 365 days, 2 years, All time) all clamp to the same underlying
 * span, so a range-equality check would light up several buttons at once
 * instead of just the one the user picked. Editing a date manually clears
 * it back to "no preset selected".
 */
export function DateRangeFilter({ span, value, onChange }: Props) {
  const [activeLabel, setActiveLabel] = useState<string | null>("All time");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((preset) => {
        const start = preset.days === "all" ? span.start : addDaysToDate(span.end, -(preset.days - 1));
        const presetRange: DateRange = { start: start < span.start ? span.start : start, end: span.end };
        const active = activeLabel === preset.label;
        return (
          <button
            key={preset.label}
            onClick={() => {
              setActiveLabel(preset.label);
              onChange(presetRange);
            }}
            className={clsx("rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors")}
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
          onChange={(e) => {
            setActiveLabel(null);
            onChange({ ...value, start: e.target.value });
          }}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <span>–</span>
        <input
          type="date"
          value={value.end}
          min={value.start}
          max={span.end}
          onChange={(e) => {
            setActiveLabel(null);
            onChange({ ...value, end: e.target.value });
          }}
          className="rounded-md border px-2 py-1"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      </div>
    </div>
  );
}
