/**
 * A tiny rendering hint for the Log page: which canonical items need
 * something other than a plain tap chip. Code-only and keyed by canonical
 * name — deliberately not part of overrides.json/user_overrides (which is
 * synced per-user to Supabase), since this is purely a UI concern, not
 * data. Add an entry here whenever a new item needs a non-tap input.
 *
 * - "duration": an hours+minutes stepper (the old Sleep input).
 * - "range": a row of preset buckets to tap one of (the new Sleep input).
 *
 * Symptom intensity (1/2/3) isn't here — it applies to *every* item on the
 * Symptoms tab, so the Log page keys it off the tab type instead.
 */
export const INPUT_KIND: Record<string, "duration" | "range"> = {
  "Sleep duration": "range",
  Sleep: "range",
};

/** Starting point shown in the DURATION picker before anything's logged
 * for the day — a sensible anchor to nudge from, not a value saved on its
 * own; nothing is written until the picker is actually touched. */
export const DURATION_DEFAULT_MINUTES: Record<string, number> = {
  "Sleep duration": 7 * 60,
  Sleep: 7 * 60,
};

/** Preset buckets for a "range" item — you tap one instead of nudging a
 * stepper. `value` is stored on the log as minutes (so sleep analytics,
 * which read minutes, keep working unchanged); it's the bucket's midpoint. */
export interface RangeOption {
  label: string;
  value: number;
}

const SLEEP_RANGES: RangeOption[] = [
  { label: "<5h", value: Math.round(4.5 * 60) },
  { label: "5–6h", value: Math.round(5.5 * 60) },
  { label: "6–7h", value: Math.round(6.5 * 60) },
  { label: "7–8h", value: Math.round(7.5 * 60) },
  { label: "8–9h", value: Math.round(8.5 * 60) },
  { label: "9h+", value: Math.round(9.5 * 60) },
];

export const RANGE_OPTIONS: Record<string, RangeOption[]> = {
  "Sleep duration": SLEEP_RANGES,
  Sleep: SLEEP_RANGES,
};

/** The bucket label a stored range value falls in — for the day timeline.
 * Falls back to the raw value's nearest bucket so a value logged with the
 * old stepper still reads as a range. */
export function rangeLabelForValue(item: string, value: number): string | null {
  const opts = RANGE_OPTIONS[item];
  if (!opts) return null;
  let best = opts[0];
  for (const o of opts) {
    if (Math.abs(o.value - value) < Math.abs(best.value - value)) best = o;
  }
  return best.label;
}

/** 1/2/3 for the Symptoms tab. Kept as a constant so the picker and any
 * future analytics agree on the scale. */
export const SYMPTOM_INTENSITIES = [1, 2, 3] as const;
