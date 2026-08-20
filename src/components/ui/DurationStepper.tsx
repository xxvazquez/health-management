"use client";

function StepButtons({
  value,
  unit,
  step,
  min,
  max,
  onChange,
}: {
  value: number;
  unit: string;
  step: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-md" style={{ background: "var(--page-plane)" }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        disabled={value <= min}
        aria-label={`Decrease ${unit}`}
        className="flex h-6 w-6 items-center justify-center text-sm font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        −
      </button>
      <span className="min-w-9 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {value}
        {unit}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        disabled={value >= max}
        aria-label={`Increase ${unit}`}
        className="flex h-6 w-6 items-center justify-center text-sm font-medium disabled:opacity-30"
        style={{ color: "var(--text-secondary)" }}
      >
        +
      </button>
    </div>
  );
}

/** Compact hours+minutes picker — tap arrows, no typed decimals and no
 * dropdown. Reports the total in minutes, matching how duration is stored. */
export function DurationStepper({
  totalMinutes,
  onChange,
}: {
  totalMinutes: number;
  onChange: (totalMinutes: number) => void;
}) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return (
    <div className="flex items-center gap-1.5">
      <StepButtons value={hours} unit="h" step={1} min={0} max={14} onChange={(h) => onChange(h * 60 + minutes)} />
      <StepButtons value={minutes} unit="m" step={15} min={0} max={45} onChange={(m) => onChange(hours * 60 + m)} />
    </div>
  );
}

/** Plain minutes-only stepper (1–60, 1-minute steps) — for durations too
 * short/precise to need the hours+minutes split above, e.g. time spent on
 * the toilet. */
export function MinuteStepper({
  minutes,
  onChange,
  min = 1,
  max = 60,
}: {
  minutes: number;
  onChange: (minutes: number) => void;
  min?: number;
  max?: number;
}) {
  return <StepButtons value={minutes} unit="m" step={1} min={min} max={max} onChange={onChange} />;
}
