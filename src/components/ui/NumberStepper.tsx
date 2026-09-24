"use client";

/** Coarse + fine tap adjustment, no typed decimals — same "select instead
 * of type" idea as DurationStepper, generalized to any unit (kg, minutes,
 * reps). Default fine step is a quarter-unit so a real plate-loaded total
 * — 61.25, 62.5, 63.75 — is always reachable by tapping; the coarse step
 * covers the big jump to get there quickly. `compact` drops the big-step
 * buttons for tight spaces. One raised `.control-surface` capsule (10px
 * corners) with the step buttons tinted in `accent`, the way the app's
 * other steppers tint their arrows; each button is as wide as its label,
 * so "−0.25" never runs into the value. */
export function NumberStepper({
  value,
  onChange,
  unit,
  accent = "var(--ui-accent)",
  step = 0.25,
  bigStep = 2.5,
  min = 0,
  max = 400,
  compact = false,
  format,
}: {
  value: number;
  onChange: (next: number) => void;
  unit: string;
  /** Tint for the step buttons. */
  accent?: string;
  step?: number;
  bigStep?: number;
  min?: number;
  max?: number;
  compact?: boolean;
  /** Custom readout, e.g. "Ongoing" for 0. */
  format?: (value: number) => string;
}) {
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  // Round off float drift from repeated step math (0.1 + 0.2).
  const set = (n: number) => onChange(Math.round(clamp(n) * 100) / 100);

  const stepButton = (delta: number) => {
    const disabled = delta < 0 ? value <= min : value >= max;
    const label = `${delta < 0 ? "−" : "+"}${Math.abs(delta)}`;
    return (
      <button
        type="button"
        onClick={() => set(value + delta)}
        disabled={disabled}
        aria-label={`${delta < 0 ? "Decrease" : "Increase"} by ${Math.abs(delta)}${unit}`}
        className="flex h-full shrink-0 items-center px-1.5 text-xs font-medium tabular-nums transition-opacity active:opacity-50 disabled:opacity-30"
        style={{ color: accent }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="control-surface inline-flex h-8 shrink-0 items-center rounded-[10px]">
      {!compact && stepButton(-bigStep)}
      {stepButton(-step)}
      <span className="min-w-12 shrink-0 px-1.5 text-center text-sm font-medium whitespace-nowrap tabular-nums" style={{ color: "var(--text-primary)" }}>
        {format ? format(value) : `${value} ${unit}`}
      </span>
      {stepButton(step)}
      {!compact && stepButton(bigStep)}
    </div>
  );
}

/** Per-unit step presets — kg wants fine plate-sized increments, minutes
 * and reps are always whole numbers and read oddly with a quarter-step. */
export const UNIT_STEP_PRESETS: Record<string, { step: number; bigStep: number; max: number }> = {
  kg: { step: 0.25, bigStep: 2.5, max: 400 },
  minutes: { step: 1, bigStep: 5, max: 300 },
  hours: { step: 0.25, bigStep: 1, max: 24 },
  reps: { step: 1, bigStep: 5, max: 200 },
};
