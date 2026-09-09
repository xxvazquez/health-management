import type { LabMarker } from "@/lib/supabase/labs";

/** Where a value sits against its marker's reference range. Pure — the
 * colour that reads it lives in `@/components/doctors/labStatus`. */
export type RangeStatus = "low" | "in" | "high" | null;

export function rangeStatus(value: number, low: number | null, high: number | null): RangeStatus {
  if (low == null && high == null) return null;
  if (low != null && value < low) return "low";
  if (high != null && value > high) return "high";
  return "in";
}

/** The band a value should be judged against: the marker's own optimal
 * range where one is set, otherwise the lab reference range. `basis` says
 * which, so the read-out can word it ("below optimal" vs "below range"). */
export function effectiveRange(m: {
  refLow: number | null;
  refHigh: number | null;
  optimalLow: number | null;
  optimalHigh: number | null;
}): { low: number | null; high: number | null; basis: "optimal" | "reference" | null } {
  if (m.optimalLow != null || m.optimalHigh != null) return { low: m.optimalLow, high: m.optimalHigh, basis: "optimal" };
  if (m.refLow != null || m.refHigh != null) return { low: m.refLow, high: m.refHigh, basis: "reference" };
  return { low: null, high: null, basis: null };
}

export interface RangeBar {
  /** The track's numeric ends — the scale labels either side of the bar. */
  trackLow: number;
  trackHigh: number;
  /** 0–100, clamped — where the value marker sits on the track. */
  valuePct: number;
  /** 0–100 — the highlighted band's edges on the track. Always inset from
   * at least one end, so the band reads as a segment, never the whole bar. */
  bandLeftPct: number;
  bandRightPct: number;
}

/** Geometry for the horizontal range bar on the Results overview. The
 * highlighted band is the optimal range where one is set, otherwise the
 * lab reference range. The track is the lab reference range when the band
 * sits inside it, otherwise the band widened by ~35% of its width each
 * side — so there's always visible track (and a scale number) beyond the
 * band. Null when neither range is set. */
export function rangeBar(
  value: number,
  refLow: number | null,
  refHigh: number | null,
  optLow: number | null,
  optHigh: number | null,
): RangeBar | null {
  const hasOpt = optLow != null || optHigh != null;
  const hasRef = refLow != null && refHigh != null && refHigh > refLow;
  const bandLo = hasOpt ? optLow : hasRef ? refLow : null;
  const bandHi = hasOpt ? optHigh : hasRef ? refHigh : null;
  if (bandLo == null && bandHi == null) return null;

  let lo: number;
  let hi: number;
  if (
    hasRef &&
    (bandLo == null || (refLow as number) <= bandLo) &&
    (bandHi == null || (refHigh as number) >= bandHi) &&
    ((refLow as number) < (bandLo ?? Infinity) || (refHigh as number) > (bandHi ?? -Infinity))
  ) {
    // The lab reference range already contains the band with room to spare.
    lo = refLow as number;
    hi = refHigh as number;
  } else {
    const a = bandLo ?? (bandHi as number);
    const b = bandHi ?? (bandLo as number);
    const pad = (b - a || Math.abs(b) || 1) * 0.35;
    lo = a - pad;
    hi = b + pad;
    if ((bandLo ?? 0) >= 0 && lo < 0) lo = 0;
  }
  if (hi <= lo) return null;
  const clamp = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  return {
    trackLow: lo,
    trackHigh: hi,
    valuePct: clamp(value),
    bandLeftPct: clamp(bandLo ?? lo),
    bandRightPct: clamp(bandHi ?? hi),
  };
}

/** Parse a typed measurement — accepts a comma or dot decimal separator,
 * returns null for anything not a finite number. */
export function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

// --- Results overview (lab analysis) ------------------------------------------------

export interface LabRangeOption {
  id: "all" | "5y" | "2y" | "1y";
  label: string;
  years: number | null;
}

export const LAB_RANGES: LabRangeOption[] = [
  { id: "all", label: "All", years: null },
  { id: "5y", label: "5y", years: 5 },
  { id: "2y", label: "2y", years: 2 },
  { id: "1y", label: "1y", years: 1 },
];

/** Oldest and newest measurement across every marker. */
export function labsSpan(markers: LabMarker[]): { start: string; end: string } | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const m of markers) {
    for (const r of m.results) {
      if (start == null || r.measuredOn < start) start = r.measuredOn;
      if (end == null || r.measuredOn > end) end = r.measuredOn;
    }
  }
  return start && end ? { start, end } : null;
}

/** The ISO cutoff date for a range option, `today` minus N years, or null
 * for "all". Plain string math — this is only ever a lower bound for a
 * lexicographic date comparison, so a notional 29 Feb is harmless. */
export function rangeCutoff(option: LabRangeOption, today: string): string | null {
  if (option.years == null) return null;
  const [y, m, d] = today.split("-");
  return `${Number(y) - option.years}-${m}-${d}`;
}

/** Markers with their results clipped to on/after `cutoff`. Markers left
 * with nothing in the window are dropped. */
export function clipMarkers(markers: LabMarker[], cutoff: string | null): LabMarker[] {
  if (!cutoff) return markers.filter((m) => m.results.length > 0);
  const out: LabMarker[] = [];
  for (const m of markers) {
    const results = m.results.filter((r) => r.measuredOn >= cutoff);
    if (results.length > 0) out.push({ ...m, results });
  }
  return out;
}

export interface WindowSummary {
  /** Readings in the window. */
  count: number;
  /** Mean of every reading in the window — the value Average mode reads. */
  mean: number;
  min: number;
  max: number;
  /** Most recent reading in the window — the value Last mode reads. */
  latest: number;
  latestOn: string;
  /** The reading before the latest, for the change read-out (null when
   * there's only one in the window). */
  previous: number | null;
}

/** Collapse a marker's window-clipped readings into the figures the
 * Results overview shows: the mean and spread for Average mode, the latest
 * value and the one before it for Last mode and the change read-out. Null
 * when the window holds nothing. */
export function summariseWindow(
  results: readonly { value: number; measuredOn: string }[],
): WindowSummary | null {
  if (results.length === 0) return null;
  const sorted = [...results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
  const values = sorted.map((r) => r.value);
  const latest = sorted[sorted.length - 1];
  return {
    count: values.length,
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    latest: latest.value,
    latestOn: latest.measuredOn,
    previous: sorted.length >= 2 ? sorted[sorted.length - 2].value : null,
  };
}
