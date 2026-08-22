"use client";

/** Coarse + fine tap adjustment, no typed decimals — same "select instead
 * of type" idea as DurationStepper, generalized to any unit (kg, minutes,
 * reps) since a workout entry's meaning now depends on the exercise's own
 * configured unit rather than always being a weight. Default fine step is
 * a quarter-unit (not a whole one) so a real plate-loaded total — 61.25,
 * 62.5, 63.75 — is always reachable by tapping, matching how barbell
 * plates actually come in fractional-kg increments; the coarse step covers
 * the big jump to get there quickly. A single fine step from 0 could take
 * a long time to reach a real value, so this pairs a small step with a
 * bigger jump on each side rather than decomposing into two independent
 * units the way hours+minutes does — the value is one number, not two.
 * `compact` drops the big-step buttons for tight spaces (the day
 * timeline's fixed-width card). Fixed at h-7 and tinted with `accent` (not
 * the generic mint page-plane) so it reads as one unit with the Log
 * button beside it, not two visually unrelated controls stacked together. */
export function NumberStepper({
  value,
  onChange,
  unit,
  accent = "var(--text-secondary)",
  step = 0.25,
  bigStep = 2.5,
  min = 0,
  max = 400,
  compact = false,
}: {
  value: number;
  onChange: (next: number) => void;
  unit: string;
  /** Ties this control's tint to whatever it's paired with (e.g. the
   * Workout tab's per-row accent) instead of the generic neutral fill. */
  accent?: string;
  step?: number;
  bigStep?: number;
  min?: number;
  max?: number;
  compact?: boolean;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div
      className="flex h-7 items-center gap-0.5 rounded-md"
      style={{ background: `color-mix(in oklab, ${accent} 12%, var(--surface-1))` }}
    >
      {!compact && (
        <button
          type="button"
          onClick={() => onChange(clamp(value - bigStep))}
          disabled={value <= min}
          aria-label={`Decrease by ${bigStep}${unit}`}
          className="flex h-full w-8 items-center justify-center text-[11px] font-medium disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
        >
          −{bigStep}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`Decrease by ${step}${unit}`}
        className="flex h-full w-7 items-center justify-center text-[11px] font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        −{step}
      </button>
      <span className="min-w-14 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value} {unit}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`Increase by ${step}${unit}`}
        className="flex h-full w-7 items-center justify-center text-[11px] font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        +{step}
      </button>
      {!compact && (
        <button
          type="button"
          onClick={() => onChange(clamp(value + bigStep))}
          disabled={value >= max}
          aria-label={`Increase by ${bigStep}${unit}`}
          className="flex h-full w-8 items-center justify-center text-[11px] font-medium disabled:opacity-30"
          style={{ color: "var(--text-secondary)" }}
        >
          +{bigStep}
        </button>
      )}
    </div>
  );
}

/** Per-unit step presets — kg wants fine plate-sized increments, minutes
 * and reps are always whole numbers and read oddly with a quarter-step. */
export const UNIT_STEP_PRESETS: Record<string, { step: number; bigStep: number; max: number }> = {
  kg: { step: 0.25, bigStep: 2.5, max: 400 },
  minutes: { step: 1, bigStep: 5, max: 300 },
  reps: { step: 1, bigStep: 5, max: 200 },
};
