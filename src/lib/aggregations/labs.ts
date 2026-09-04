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

/** Parse a typed measurement — accepts a comma or dot decimal separator,
 * returns null for anything not a finite number. */
export function parseNum(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return raw.trim() !== "" && Number.isFinite(n) ? n : null;
}

// --- Blood dashboard ------------------------------------------------

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

/** Markers pinned to the headline grid by default — matched loosely
 * (case, spacing and any parenthetical are ignored) so the Polish import
 * names and the English demo names both land. Anything currently out of
 * range is added on top of these. */
export const DEFAULT_LAB_PINS = [
  "Ferrytyna",
  "Ferritin",
  "Żelazo",
  "Hemoglobina",
  "Hemoglobin",
  "TSH",
  "FT4",
  "Witamina D",
  "Vitamin D",
  "Witamina B12",
  "Vitamin B12",
  "Kwas foliowy",
  "Cholesterol całkowity",
  "HbA1c",
  "Glukoza",
  "CRP",
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
    const status = rangeStatus(latest.value, m.refLow, m.refHigh);
    const isPinned = pins.includes(normalizeName(m.name));
    if (!isPinned && status !== "low" && status !== "high") continue;
    rows.push({
      id: m.id,
      name: m.name,
      unit: m.unit,
      latest: latest.value,
      measuredOn: latest.measuredOn,
      status,
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
  refLow: number | null;
  refHigh: number | null;
}

/** The latest reading of every marker that is currently out of range,
 * newest first. */
export function flaggedReadings(markers: LabMarker[]): FlaggedReading[] {
  const out: FlaggedReading[] = [];
  for (const m of markers) {
    if (m.results.length === 0) continue;
    const latest = [...m.results].sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))[m.results.length - 1];
    const status = rangeStatus(latest.value, m.refLow, m.refHigh);
    if (status !== "low" && status !== "high") continue;
    out.push({
      markerId: m.id,
      name: m.name,
      unit: m.unit,
      value: latest.value,
      measuredOn: latest.measuredOn,
      status,
      refLow: m.refLow,
      refHigh: m.refHigh,
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
