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

/** Where the normal band sits on every Results bar, as % of the track. */
export const BAND_LEFT_PCT = 30;
export const BAND_RIGHT_PCT = 70;
/** How far outside the band a value can land before it stops at the end. */
const OUTSIDE_PCT = 28;

export interface RangeBar {
  /** 0–100 — the band's edges on the track. */
  bandLeftPct: number;
  bandRightPct: number;
  /** 0–100 — where a value sits on the track. */
  pct: (value: number) => number;
}

/** Geometry for the range bar on the Results overview. Every marker's
 * normal band sits in the same place, so the rows line up and an
 * out-of-range dot sticks out to the left or right. A value outside the
 * band moves out by how many band-widths it is away, stopping near the
 * track end. A one-sided range (only a low or only a high) runs its band
 * to that end of the track. Null when neither bound is set. */
export function rangeBar(low: number | null, high: number | null): RangeBar | null {
  const out = (d: number) => Math.min(1, Math.max(0, d)) * OUTSIDE_PCT;
  if (low != null && high != null) {
    if (high <= low) return null;
    const w = high - low;
    return {
      bandLeftPct: BAND_LEFT_PCT,
      bandRightPct: BAND_RIGHT_PCT,
      pct: (v) => {
        const t = (v - low) / w;
        if (t < 0) return BAND_LEFT_PCT - out(-t);
        if (t > 1) return BAND_RIGHT_PCT + out(t - 1);
        return BAND_LEFT_PCT + t * (BAND_RIGHT_PCT - BAND_LEFT_PCT);
      },
    };
  }
  const bound = low ?? high;
  if (bound == null) return null;
  const w = Math.abs(bound) || 1;
  // A one-sided band has no width to scale by, so an in-range value moves
  // into it by how far it is from the bound, relative to the bound itself.
  const into = (d: number) => Math.min(1, Math.max(0, d)) * 50;
  if (low != null) {
    return {
      bandLeftPct: BAND_LEFT_PCT,
      bandRightPct: 100,
      pct: (v) => (v < low ? BAND_LEFT_PCT - out((low - v) / w) : BAND_LEFT_PCT + into((v - low) / w)),
    };
  }
  return {
    bandLeftPct: 0,
    bandRightPct: BAND_RIGHT_PCT,
    pct: (v) => (v > bound ? BAND_RIGHT_PCT + out((v - bound) / w) : BAND_RIGHT_PCT - into((bound - v) / w)),
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
