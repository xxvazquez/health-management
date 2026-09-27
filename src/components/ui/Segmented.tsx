"use client";

import type { ReactNode } from "react";
import { useRovingTabs } from "@/lib/useRovingTabs";

/** A small inline segmented control — one row of buttons on a faint track, the
 * active one raised and tinted with the given accent. Used for the trend
 * charts' time-window / mode switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  accent = "var(--ui-accent)",
  fill = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, ReactNode])[];
  accent?: string;
  /** Stretch across the container with equal segments, like an iOS period picker. */
  fill?: boolean;
}) {
  const ids = options.map(([v]) => v);
  const { registerRef, handleKeyDown, tabIndex } = useRovingTabs(ids, value, onChange);
  return (
    <div className={`${fill ? "flex w-full" : "inline-flex w-fit"} rounded-[10px] p-0.5`} style={{ background: "var(--segment-track)", boxShadow: "inset 0 0 0 0.5px var(--border-hairline)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          ref={registerRef(v)}
          type="button"
          onClick={() => onChange(v)}
          onKeyDown={(e) => handleKeyDown(e, v)}
          tabIndex={tabIndex(v)}
          aria-pressed={value === v}
          className={`hit-slop min-h-8 rounded-lg px-3 text-sm font-medium ${fill ? "flex-1" : ""} ${value === v ? "control-surface" : ""}`}
          style={{
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
