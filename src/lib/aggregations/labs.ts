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
  { id: "5y", label: "5 years", years: 5 },
  { id: "2y", label: "2 years", years: 2 },
  { id: "1y", label: "1 year", years: 1 },
];

/** Markers pinned to the headline grid by default. The first block is the
 * live data's exact marker names (from the blood-history import); the
 * second is the signed-out demo's English equivalents. Matching ignores
 * case, spacing and any parenthetical — "Hemoglobina (HGB)" matches
 * "Hemoglobina" — and anything currently out of range is pinned on top of
 * these regardless. A per-user editable set is a planned follow-up. */
export const DEFAULT_LAB_PINS = [
  // Live data (verified against the import catalogue)
  "Ferrytyna",
  "Żelazo",
  "Hemoglobina (HGB)",
  "TSH",
  "FT4",
  "Witamina D",
  "Witamina B12",
  "Kwas foliowy",
  "Cholesterol całkowity",
  "HbA1c",
  "Glukoza",
  "CRP",
  // Demo data
  "Ferritin",
  "Hemoglobin (HGB)",
  "Vitamin D (25-OH)",
];

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

export interface HeadlineMarker {
  id: string;
  name: string;
  unit: string | null;
  latest: number | null;
  measuredOn: string | null;
  status: RangeStatus;
  /** Whether `status` was read against the optimal range or the lab
   * reference range (null when the marker has neither). */
  basis: "optimal" | "reference" | null;
  previous: number | null;
  deltaPct: number | null;
  spark: number[];
  pinned: boolean;
}

/** The headline grid: every pinned marker plus anything whose latest
 * reading is out of range. Out-of-range first, then pin order, then name. */
export function headlineMarkers(markers: LabMarker[], pinnedNames: string[]): HeadlineMarker[] {
  const pins = pinnedNames.map(normalizeName);
  const rows: HeadlineMarker[] = [];
  for (const m of markers) {
    if (m.results.length === 0) continue;
    const sorted = [...m.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    const latest = sorted[sorted.length - 1];
    const previous = sorted.length >= 2 ? sorted[sorted.length - 2] : null;
    const { low, high, basis } = effectiveRange(m);
    const status = rangeStatus(latest.value, low, high);
    const isPinned = pins.includes(normalizeName(m.name));
    if (!isPinned && status !== "low" && status !== "high") continue;
    rows.push({
      id: m.id,
      name: m.name,
      unit: m.unit,
      latest: latest.value,
      measuredOn: latest.measuredOn,
      status,
      basis,
      previous: previous?.value ?? null,
      deltaPct:
        previous && previous.value !== 0 ? ((latest.value - previous.value) / Math.abs(previous.value)) * 100 : null,
      spark: sorted.slice(-8).map((r) => r.value),
      pinned: isPinned,
    });
  }
  const outOfRange = (s: RangeStatus) => s === "low" || s === "high";
  return rows.sort((a, b) => {
    if (outOfRange(a.status) !== outOfRange(b.status)) return outOfRange(a.status) ? -1 : 1;
    const ai = a.pinned ? pins.indexOf(normalizeName(a.name)) : Number.MAX_SAFE_INTEGER;
    const bi = b.pinned ? pins.indexOf(normalizeName(b.name)) : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.name.localeCompare(b.name);
  });
}

export interface FlaggedReading {
  markerId: string;
  name: string;
  unit: string | null;
  value: number;
  measuredOn: string;
  status: "low" | "high";
  /** The bound the value missed, and which band it came from. */
  low: number | null;
  high: number | null;
  basis: "optimal" | "reference";
}

/** The latest reading of every marker that is currently outside its
 * optimal range (or its reference range when no optimal one is set),
 * newest first. */
export function flaggedReadings(markers: LabMarker[]): FlaggedReading[] {
  const out: FlaggedReading[] = [];
  for (const m of markers) {
    if (m.results.length === 0) continue;
    const latest = [...m.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))[m.results.length - 1];
    const { low, high, basis } = effectiveRange(m);
    const status = rangeStatus(latest.value, low, high);
    if ((status !== "low" && status !== "high") || basis == null) continue;
    out.push({
      markerId: m.id,
      name: m.name,
      unit: m.unit,
      value: latest.value,
      measuredOn: latest.measuredOn,
      status,
      low,
      high,
      basis,
    });
  }
  return out.sort((a, b) => b.measuredOn.localeCompare(a.measuredOn));
}

export interface NormalizedSeries {
  data: Record<string, string | number>[];
  note: "midpoint" | "minmax" | "mixed";
}

/** Every marker's values put on one 0-around-100 scale so unrelated
 * markers can share an overlay chart: a percent of the reference midpoint
 * where a range is set, otherwise a 0–100 min–max of the marker's own
 * history. */
export function normalizedSeries(markers: LabMarker[]): NormalizedSeries {
  const byDate = new Map<string, Record<string, string | number>>();
  let midpoint = 0;
  let minmax = 0;
  for (const m of markers) {
    const values = m.results.map((r) => r.value);
    if (values.length === 0) continue;
    const hasRef = m.refLow != null && m.refHigh != null;
    let scale: (v: number) => number;
    if (hasRef) {
      const mid = ((m.refLow as number) + (m.refHigh as number)) / 2;
      scale = (v) => (mid !== 0 ? (v / mid) * 100 : v);
      midpoint++;
    } else {
      const lo = Math.min(...values);
      const hi = Math.max(...values);
      const span = hi - lo || 1;
      scale = (v) => ((v - lo) / span) * 100;
      minmax++;
    }
    for (const r of m.results) {
      const row = byDate.get(r.measuredOn) ?? { date: r.measuredOn };
      row[m.id] = Math.round(scale(r.value) * 10) / 10;
      byDate.set(r.measuredOn, row);
    }
  }
  const data = [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const note: NormalizedSeries["note"] = midpoint > 0 && minmax > 0 ? "mixed" : minmax > 0 ? "minmax" : "midpoint";
  return { data, note };
}
