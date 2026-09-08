"use client";

/** The shared "Time" field for the Log tabs — a label plus a native time
 * input that stays neutral while it reads roughly "now" and takes an amber
 * border once it's set more than a few minutes off, a quiet cue that the
 * entry is being timestamped for earlier. Pass `onReset` to show a "now"
 * link beside it. */
export function TimeField({
  value,
  onChange,
  onReset,
  autoFocus,
  explicit: explicitProp,
}: {
  value: string;
  onChange: (time: string) => void;
  onReset?: () => void;
  autoFocus?: boolean;
  /** Override the amber "set for earlier" tint. Defaults to: the value is
   * more than five minutes off the current time. */
  explicit?: boolean;
}) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [h, m] = value.split(":").map(Number);
  const explicit = explicitProp ?? Math.abs((h || 0) * 60 + (m || 0) - nowMinutes) > 5;
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Time
      </span>
      <input
        type="time"
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className="h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums outline-none transition-colors"
        style={{
          borderColor: explicit ? "var(--series-2)" : "var(--border-hairline)",
          background: "var(--surface-1)",
          color: "var(--text-primary)",
        }}
      />
      {onReset && (
        <button type="button" onClick={onReset} className="text-xs underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          now
        </button>
      )}
    </label>
  );
}
