"use client";

import { CONTROL_CLS, CONTROL_STYLE } from "@/components/ui/Chip";
import { useState } from "react";
import { ClockIcon } from "@/components/ui/icons";

/** The shared "Time" field for the Log tabs — a clock icon plus a native
 * time input that stays neutral while it reads roughly "now" and takes an
 * amber border once it's set more than a few minutes off, a quiet cue that
 * the entry is being timestamped for earlier. Pass `onReset` to show a "now"
 * link beside it.
 *
 * With `collapsible`, the whole field starts folded into a small icon +
 * "now" pill and only expands to the box on tap, or automatically once the
 * value reads away from now (or `explicit` is forced) — the same rule
 * everywhere it's used, so it never looks like two different controls. */
export function TimeField({
  value,
  onChange,
  onReset,
  explicit: explicitProp,
  collapsible,
}: {
  value: string;
  onChange: (time: string) => void;
  onReset?: () => void;
  /** Override the amber "set for earlier" tint. Defaults to: the value is
   * more than five minutes off the current time. */
  explicit?: boolean;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [h, m] = value.split(":").map(Number);
  const explicit = explicitProp ?? Math.abs((h || 0) * 60 + (m || 0) - nowMinutes) > 5;

  if (collapsible && !explicit && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-label="Time: now, tap to change"
        className={CONTROL_CLS}
        style={CONTROL_STYLE}
      >
        <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
          <ClockIcon />
        </span>
        now
      </button>
    );
  }

  const userExpanded = collapsible && expanded && !explicit;
  return (
    <label className="flex items-center gap-2 self-start">
      <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>
        <ClockIcon />
      </span>
      <span className="sr-only">Time</span>
      <input
        type="time"
        value={value}
        autoFocus={userExpanded}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="h-9 rounded-[10px] px-3 text-sm tabular-nums outline-none transition-colors"
        style={{
          ...CONTROL_STYLE,
          boxShadow: explicit ? "inset 0 0 0 1px var(--series-2)" : "none",
        }}
      />
      {(onReset || userExpanded) && (
        <button
          type="button"
          onClick={() => {
            onReset?.();
            setExpanded(false);
          }}
          className="text-sm font-medium"
          style={{ color: "var(--ui-accent)" }}
        >
          now
        </button>
      )}
    </label>
  );
}
