"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  /** Defaults to the rolling-window presets — pass a different list to
   * change the wording/granularity for one page without touching the
   * others that share this control. */
  presets?: DateRangePreset[];
  /** Matches whichever page this renders on (its TYPE_ACCENT, or a
   * page-level accent), so the control never clashes with the page's own
   * accent. Defaults to series-1 for call sites that haven't opted in. */
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

function presetRange(preset: DateRangePreset, span: DateRange): DateRange {
  if (preset.days === "all") return { start: span.start, end: span.end };
  const start = addDaysToDate(span.end, -(preset.days - 1));
  return { start: start < span.start ? span.start : start, end: span.end };
}

function fmtShort(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The label shown on the trigger button — a matching preset's name, or a
 * plain formatted span. Exported so a page can echo the active range in
 * prose ("Showing …") using the exact same wording as the control. */
export function describeDateRange(presets: DateRangePreset[], span: DateRange, value: DateRange): string {
  const active = presets.find((p) => {
    const r = presetRange(p, span);
    return r.start === value.start && r.end === value.end;
  });
  return active ? active.label : `${fmtShort(value.start)} – ${fmtShort(value.end)}`;
}

/**
 * One compact control: a button showing the current range that opens a
 * popover of presets plus a custom start/end. Replaces the old row of six
 * pills and two always-visible date inputs, which wrapped to two or three
 * lines on every dashboard.
 *
 * The active preset is derived by matching `value` against each preset's
 * computed range (first match wins) rather than tracked as state, so the
 * selection reads correctly even after `useDateRangeFilter` rehydrates a
 * range picked on another dashboard.
 */
export function DateRangeFilter({ span, value, onChange, presets = DEFAULT_PRESETS, accent = "var(--series-1)" }: Props) {
  const [open, setOpen] = useState(false);
  // Which edge of the trigger the popover hangs from — right by default, but
  // flipped to the left edge when the trigger sits too close to the screen's
  // left edge for a right-anchored panel to fit (e.g. Food, where it wraps
  // onto its own left-aligned line).
  const [alignLeft, setAlignLeft] = useState(false);
  const POPOVER_WIDTH = 224;
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    setAlignLeft(rect.right < POPOVER_WIDTH + 8);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root) return;
      // Keep the popover open while a native date picker is being used —
      // focus stays inside our inputs even though the picker overlay is
      // technically outside the root.
      if (root.contains(e.target as Node) || root.contains(document.activeElement)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activePreset = presets.find((p) => {
    const r = presetRange(p, span);
    return r.start === value.start && r.end === value.end;
  });
  const triggerLabel = describeDateRange(presets, span, value);

  const fieldStyle = { borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" } as const;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors"
        style={{ borderColor: open ? accent : "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-secondary)" }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="4.5" width="13" height="12" rx="1.5" />
          <path d="M3.5 8h13M7 3v3M13 3v3" />
        </svg>
        <span className="tabular-nums" style={{ color: "var(--text-primary)" }}>{triggerLabel}</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}
        >
          <path d="M5 7.5 10 12.5 15 7.5" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Date range"
          className={`absolute z-30 mt-1.5 w-56 rounded-lg border p-1.5 ${alignLeft ? "left-0" : "right-0"}`}
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
        >
          <div className="flex flex-col">
            {presets.map((preset) => {
              const isActive = preset.label === activePreset?.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    onChange(presetRange(preset, span));
                    setOpen(false);
                  }}
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors"
                  style={{
                    background: isActive ? `color-mix(in oklab, ${accent} 12%, transparent)` : "transparent",
                    color: isActive ? accent : "var(--text-secondary)",
                    fontWeight: isActive ? 600 : 400,
                  }}
                >
                  {preset.label}
                  {isActive && (
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M4 10.5 8 14.5 16 5.5" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-1.5 border-t pt-2" style={{ borderColor: "var(--gridline)" }}>
            <p className="mb-1.5 px-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Custom range
            </p>
            <div className="flex flex-col gap-1 px-1">
              <input
                type="date"
                aria-label="Start date"
                value={value.start}
                min={span.start}
                max={value.end}
                onChange={(e) => onChange({ ...value, start: e.target.value })}
                className="w-full rounded-md border px-2 py-1 text-xs"
                style={fieldStyle}
              />
              <input
                type="date"
                aria-label="End date"
                value={value.end}
                min={value.start}
                max={span.end}
                onChange={(e) => onChange({ ...value, end: e.target.value })}
                className="w-full rounded-md border px-2 py-1 text-xs"
                style={fieldStyle}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
