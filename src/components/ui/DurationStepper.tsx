"use client";

function StepButtons({
  value,
  unit,
  step,
  min,
  max,
  accent,
  onChange,
}: {
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  accent: string;
  onChange: (next: number) => void;
}) {
  return (
    <div
      className="flex h-7 items-center gap-0.5 rounded-md"
      style={{ background: `color-mix(in oklab, ${accent} 12%, var(--surface-1))` }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`Decrease by ${step}${unit}`}
        className="flex h-full w-7 items-center justify-center text-xs font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        −{step}
      </button>
      <span className="min-w-9 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value}
        {unit}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`Increase by ${step}${unit}`}
        className="flex h-full w-7 items-center justify-center text-xs font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        +{step}
      </button>
    </div>
  );
}

/** Compact hours+minutes picker — tap arrows, no typed decimals and no
 * dropdown. Reports the total in minutes, matching how duration is stored.
 * Same h-7/accent-tint/labeled-step conventions as NumberStepper so the two
 * don't read as unrelated controls. */
export function DurationStepper({
  totalMinutes,
  onChange,
  accent = "var(--text-secondary)",
}: {
  totalMinutes: number;
  onChange: (totalMinutes: number) => void;
  accent?: string;
}) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <div className="flex items-center gap-1.5">
      <StepButtons value={hours} unit="h" step={1} min={0} max={14} accent={accent} onChange={(h) => onChange(h * 60 + minutes)} />
      <StepButtons value={minutes} unit="m" step={15} min={0} max={45} accent={accent} onChange={(m) => onChange(hours * 60 + m)} />
    </div>
  );
}
