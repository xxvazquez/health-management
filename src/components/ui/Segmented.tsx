"use client";

import type { ReactNode } from "react";

/** A small inline segmented control — one row of buttons on a filled track, the
 * active one raised and tinted with the given accent. Used for the trend
 * charts' time-window / mode switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  accent = "var(--ui-accent)",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, ReactNode])[];
  accent?: string;
}) {
  return (
    <div className="inline-flex w-fit rounded-[10px] p-0.5" style={{ background: "var(--field-fill)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="hit-slop min-h-8 rounded-lg px-3 text-sm font-medium"
          style={{
            background: value === v ? "var(--surface-1)" : "transparent",
            boxShadow: value === v ? "var(--shadow-card)" : "none",
            color: value === v ? accent : "var(--text-secondary)",
            // iOS Safari can leave a stale paint on a background-color-only
            // change (no layout impact) until something else forces a
            // redraw — the segment stays showing its old tint alongside the
            // newly selected one until a scroll or another tap. Promoting
            // each button to its own compositing layer makes the tint swap
            // repaint immediately instead.
            transform: "translateZ(0)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
