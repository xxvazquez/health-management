"use client";

import { Wheel, WheelFrame } from "@/components/ui/pickers/TimeWheels";

function nearestIndex(values: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - value) < Math.abs(values[best] - value)) best = i;
  return best;
}

/** Evenly spaced numbers from `from` to `to`, for a `NumberWheel`. */
export function numberRange(from: number, to: number, step: number): number[] {
  const count = Math.round((to - from) / step) + 1;
  return Array.from({ length: count }, (_, i) => Math.round((from + i * step) * 100) / 100);
}

/** A single iOS picker wheel over a fixed list of numbers — the value is
 * picked, never typed. Snaps to the nearest option. */
export function NumberWheel({
  values,
  value,
  onChange,
  format,
  label,
  width = 120,
}: {
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
  format: (value: number) => string;
  label: string;
  width?: number;
}) {
  return (
    <WheelFrame>
      <Wheel count={values.length} value={nearestIndex(values, value)} onChange={(i) => onChange(values[i])} format={(i) => format(values[i])} label={label} width={width} />
    </WheelFrame>
  );
}

const QUARTERS = ["00", "25", "50", "75"];

/** Whole kilograms and a quarter-kilo wheel side by side, like iOS's
 * multi-column pickers — any plate-loaded weight up to `max` kg. */
export function KgWheels({ value, onChange, label, max = 400 }: { value: number; onChange: (value: number) => void; label: string; max?: number }) {
  const whole = Math.min(max, Math.max(0, Math.floor(value)));
  const quarter = Math.min(3, Math.max(0, Math.round((value - whole) * 4)));
  return (
    <WheelFrame>
      <Wheel count={max + 1} value={whole} onChange={(w) => onChange(w + quarter / 4)} format={String} label={`${label}, whole kilograms`} width={64} />
      <Wheel count={4} value={quarter} onChange={(q) => onChange(whole + q / 4)} format={(q) => `.${QUARTERS[q]}`} label={`${label}, fraction`} width={52} />
      <span className="pr-3 text-sm" style={{ color: "var(--text-secondary)" }}>
        kg
      </span>
    </WheelFrame>
  );
}
