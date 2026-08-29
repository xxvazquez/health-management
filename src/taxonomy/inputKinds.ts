/**
 * A tiny rendering hint for the Log page: which canonical items need
 * something other than a plain tap chip. Code-only and keyed by canonical
 * name — deliberately not part of overrides.json/user_overrides (which is
 * synced per-user to Supabase), since this is purely a UI concern, not
 * data. Add an entry here whenever a new item needs a non-tap input.
 *
 * - "band": a row of coarse preset ranges, tap one (Sleep). For a measure
 *   you only know roughly — speed over precision.
 * - "duration": an exact hours+minutes stepper. Kept for anything that's
 *   genuinely quantitative (a weigh-in); nothing uses it right now.
 *
 * Symptom intensity (1/2/3) isn't here — it applies to *every* item on the
 * Symptoms tab, so the Log page keys it off the tab type instead.
 */
export const INPUT_KIND: Record<string, "band" | "duration"> = {
  "Sleep duration": "band",
  Sleep: "band",
};

/** Starting point shown in the "duration" stepper before anything's logged
 * for the day — a sensible anchor to nudge from, not a value saved on its
 * own; nothing is written until the picker is actually touched. */
export const DURATION_DEFAULT_MINUTES: Record<string, number> = {
  "Sleep duration": 7 * 60,
  Sleep: 7 * 60,
};

/** One tappable range for a "band" item. `value` is what gets stored on the
 * log, in minutes — the band's midpoint — so anything reading a duration
 * (sleep analytics, `formatMinutes`) keeps working with no schema change. */
export interface BandOption {
  label: string;
  value: number;
}

const SLEEP_BANDS: BandOption[] = [
  { label: "<5h", value: Math.round(4.5 * 60) },
  { label: "5–6h", value: Math.round(5.5 * 60) },
  { label: "6–7h", value: Math.round(6.5 * 60) },
  { label: "7–8h", value: Math.round(7.5 * 60) },
  { label: "8–9h", value: Math.round(8.5 * 60) },
  { label: "9h+", value: Math.round(9.5 * 60) },
];

export const BAND_OPTIONS: Record<string, BandOption[]> = {
  "Sleep duration": SLEEP_BANDS,
  Sleep: SLEEP_BANDS,
};

/** Which band a stored value falls in — nearest by value, so a value logged
 * with the old stepper (or a midpoint that drifted) still reads as a band
 * in the day timeline. */
export function bandLabelForValue(item: string, value: number): string | null {
  const opts = BAND_OPTIONS[item];
  if (!opts) return null;
  let best = opts[0];
  for (const o of opts) {
    if (Math.abs(o.value - value) < Math.abs(best.value - value)) best = o;
  }
  return best.label;
}

/** The band whose midpoint a stored value is closest to — for highlighting
 * the active segment. Returns null when nothing's logged. */
export function activeBandValue(item: string, value: number | null | undefined): number | null {
  if (value == null) return null;
  const label = bandLabelForValue(item, value);
  return BAND_OPTIONS[item]?.find((o) => o.label === label)?.value ?? null;
}
