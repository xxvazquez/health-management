"use client";

import { useState } from "react";

/** The shared "Time" field for the Log tabs — a label plus a native time
 * input that stays neutral while it reads roughly "now" and takes an amber
 * border once it's set more than a few minutes off, a quiet cue that the
 * entry is being timestamped for earlier. Pass `onReset` to show a "now"
 * link beside it.
 *
 * With `collapsible`, the whole field starts folded into a "now · change"
 * text link and only expands to the box on tap, or automatically once the
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
      <button type="button" onClick={() => setExpanded(true)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        Time: <span style={{ color: "var(--text-secondary)" }}>now</span>
        <span className="ml-1" style={{ color: "var(--ui-accent)" }}>change</span>
      </button>
    );
  }

  const userExpanded = collapsible && expanded && !explicit;
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Time
      </span>
      <input
        type="time"
        value={value}
        autoFocus={userExpanded}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors"
        style={{
          borderColor: explicit ? "var(--series-2)" : "var(--border-hairline)",
          background: "var(--surface-1)",
          color: "var(--text-primary)",
        }}
      />
      {(onReset || userExpanded) && (
        <button
          type="button"
          onClick={() => {
            onReset?.();
            setExpanded(false);
          }}
          className="text-xs font-medium"
          style={{ color: "var(--ui-accent)" }}
        >
          now
        </button>
      )}
    </label>
  );
}
