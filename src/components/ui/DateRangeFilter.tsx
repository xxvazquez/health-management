"use client";

import { useState } from "react";
import clsx from "clsx";
import type { DateRange } from "@/lib/aggregations/common";
import { addDaysToDate } from "@/lib/aggregations/common";

export interface DateRangePreset {
  label: string;
  days: number | "all";
}

interface Props {
  span: DateRange;
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Defaults to the original rolling-window presets — pass a different
   * list to change the wording/granularity for one page without affecting
   * the other 5 pages that share this component. */
  presets?: DateRangePreset[];
  /** Labels the manual date inputs "Custom" — off by default so existing
   * pages keep their current unlabeled look. */
  customLabel?: boolean;
  /** Matches whichever page this renders on (its TYPE_ACCENT, or a
   * page-level accent like Workout's) rather than a hardcoded color, so
   * this selector never clashes with the page's own accent. Defaults to
   * series-1 for the couple of call sites that haven't opted in yet. */
  accent?: string;
}

const DEFAULT_PRESETS: DateRangePreset[] = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
  { label: "Last 6 months", days: 182 },
  { label: "Last year", days: 365 },
  { label: "All time", days: "all" },
];

/**
 * Which preset reads as "active" is tracked by which button was actually
 * clicked, not by comparing ranges — with a short dataset, several presets
 * (90 days, 6 months, 1 year, All time) all clamp to the same underlying
 * span, so a range-equality check would light up several buttons at once
 * instead of just the one the user picked. Editing a date manually clears
 * it back to "no preset selected".
 */
export function DateRangeFilter({ span, value, onChange, presets = DEFAULT_PRESETS, customLabel = false, accent = "var(--series-1)" }: Props) {
  const [activeLabel, setActiveLabel] = useState<string | null>("All time");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((preset) => {
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
            // Same tinted-border selector shape as the Log page's meal
            // picker — a filter/selector, not primary navigation, so it
            // deliberately doesn't borrow the underline tab shape either.
            className={clsx("flex h-7 items-center rounded-md border px-2.5 text-xs font-medium whitespace-nowrap transition-colors")}
            style={{
              borderColor: active ? accent : "var(--border-hairline)",
              background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
              color: active ? accent : "var(--text-secondary)",
            }}
          >
            {preset.label}
          </button>
        );
      })}
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {customLabel && <span className="font-medium">Custom:</span>}
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
