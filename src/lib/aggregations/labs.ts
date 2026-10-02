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

/** A move worth pointing out: a quarter of the normal band's width, or a
 * fifth of the previous value for a marker without a two-sided range. */
const NOTABLE_BAND_SHARE = 0.25;
const NOTABLE_RELATIVE_CHANGE = 0.2;

export interface LastTestItem {
  marker: LabMarker;
  value: number;
  status: RangeStatus;
  previous: { value: number; measuredOn: string } | null;
  /** Out of range now, back in range since the previous result, or a notable move within range. */
  kind: "out" | "back" | "moved";
}

/** How one marker's latest reading compares with the one before: out of
 * range, back in range, a notable move (with its size, 1 = just notable),
 * or nothing worth a mention. */
function classifyReading(
  marker: LabMarker,
  latest: { value: number },
  before: { value: number; measuredOn: string } | null,
): { item: LastTestItem; size: number } | null {
  const { low, high } = effectiveRange(marker);
  const status = rangeStatus(latest.value, low, high);
  const previous = before ? { value: before.value, measuredOn: before.measuredOn } : null;
  const base = { marker, value: latest.value, status, previous };
  if (status === "low" || status === "high") return { item: { ...base, kind: "out" }, size: 0 };
  if (!previous) return null;
  const prevStatus = rangeStatus(previous.value, low, high);
  if (prevStatus === "low" || prevStatus === "high") return { item: { ...base, kind: "back" }, size: 0 };
  const delta = Math.abs(latest.value - previous.value);
  const size = low != null && high != null && high > low ? delta / (high - low) / NOTABLE_BAND_SHARE : previous.value !== 0 ? delta / Math.abs(previous.value) / NOTABLE_RELATIVE_CHANGE : 0;
  return size >= 1 ? { item: { ...base, kind: "moved" }, size } : null;
}

/** Each marker measured between `start` and `end` (inclusive), its latest
 * reading in that window against its last reading before the window: out
 * of range first, then back in range, then the biggest moves. */
export function markerHighlights(markers: LabMarker[], start: string, end: string): { measured: number; items: LastTestItem[] } {
  const found: { item: LastTestItem; size: number }[] = [];
  let measured = 0;
  for (const marker of markers) {
    const sorted = [...marker.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn));
    const inWindow = sorted.filter((r) => r.measuredOn >= start && r.measuredOn <= end);
    const latest = inWindow[inWindow.length - 1];
    if (!latest) continue;
    measured++;
    const before = [...sorted].reverse().find((r) => r.measuredOn < start) ?? null;
    const hit = classifyReading(marker, latest, before);
    if (hit) found.push(hit);
  }
  const order = { out: 0, back: 1, moved: 2 };
  found.sort((a, b) => order[a.item.kind] - order[b.item.kind] || b.size - a.size || a.item.marker.name.localeCompare(b.item.marker.name));
  return { measured, items: found.map((f) => f.item) };
}

/** Every marker with a result, cut down to its newest one — however long
 * ago that was. */
export function latestResults(markers: LabMarker[]): LabMarker[] {
  const out: LabMarker[] = [];
  for (const m of markers) {
    const newest = m.results.reduce<LabMarker["results"][number] | null>((a, r) => (!a || r.measuredOn > a.measuredOn ? r : a), null);
    if (newest) out.push({ ...m, results: [newest] });
  }
  return out;
}
