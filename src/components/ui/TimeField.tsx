"use client";

import { CONTROL_CLS, CONTROL_STYLE } from "@/components/ui/Chip";
import { TimePicker } from "@/components/ui/DatePicker";
import { ClockIcon } from "@/components/ui/icons";

/** The shared "Time" control for the Log tabs — a clock plus "now" while the
 * value reads roughly the current time, or the set time (with a blue ring, a
 * quiet cue that the entry is stamped for earlier) once it's more than a few
 * minutes off. Tapping opens the time picker; its Now button snaps back. */
export function TimeField({
  value,
  onChange,
  explicit: explicitProp,
}: {
  value: string;
  onChange: (time: string) => void;
  /** Override the "set for earlier" cue. Defaults to: the value is more than
   * five minutes off the current time. */
  explicit?: boolean;
}) {
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const [h, m] = value.split(":").map(Number);
  const explicit = explicitProp ?? Math.abs((h || 0) * 60 + (m || 0) - nowMinutes) > 5;
  return (
    <TimePicker
      value={value}
      onChange={onChange}
      title="Time"
      renderTrigger={(open, display) => (
        <button
          type="button"
          onClick={open}
          aria-haspopup="dialog"
          aria-label={explicit ? `Time: ${display}, tap to change` : "Time: now, tap to change"}
          className={`${CONTROL_CLS} tabular-nums`}
          style={{ ...CONTROL_STYLE, boxShadow: explicit ? "inset 0 0 0 1px var(--series-2)" : "none" }}
        >
          <span aria-hidden="true" style={{ color: "var(--text-muted)" }}>
            <ClockIcon />
          </span>
          {explicit ? display : "now"}
        </button>
      )}
    />
  );
}
