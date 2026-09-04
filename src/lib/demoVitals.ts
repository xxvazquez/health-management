import type { BloodPressureReading, WeightReading } from "@/lib/supabase/vitals";

/** Example vitals for the Medical → Vitals tab and the Blood dashboard
 * when signed out — interactive, in-memory only, nothing saved. */
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hour = 8) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

export function buildDemoBloodPressure(): BloodPressureReading[] {
  const raw: [number, number, number, number | null, string | null][] = [
    // daysAgo, systolic, diastolic, pulse, note
    [42, 138, 89, 74, "Morning, before coffee."],
    [35, 134, 86, 70, null],
    [28, 131, 84, 72, "After starting to walk daily."],
    [21, 129, 82, 68, null],
    [14, 126, 80, 71, null],
    [7, 124, 79, 69, "Feeling less tense this week."],
    [1, 122, 78, 70, null],
  ];
  return raw
    .map(([d, systolic, diastolic, pulse, note], i) => ({ id: `demo-bp-${i}`, measuredAt: at(d), systolic, diastolic, pulse, note }))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}

export function buildDemoWeight(): WeightReading[] {
  const raw: [number, number, string | null][] = [
    [56, 68.4, null],
    [42, 68.0, null],
    [28, 67.5, "Cut back on evening snacks."],
    [14, 67.1, null],
    [3, 66.7, null],
  ];
  return raw
    .map(([d, kg, note], i) => ({ id: `demo-weight-${i}`, measuredAt: at(d, 7), kg, note }))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt));
}
