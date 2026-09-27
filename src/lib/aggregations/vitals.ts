/** Blood-pressure classification and small vitals helpers — pure, shared
 * by the Health → Vitals tab and the Results tab's overview. */

type BpCategory = "low" | "normal" | "elevated" | "stage1" | "stage2" | "crisis";

export interface BpCategoryInfo {
  id: BpCategory;
  label: string;
  /** CSS colour token for the dot / zone. */
  color: string;
}

/** Low blood pressure: systolic under 90 or diastolic under 60 mmHg. */
export const BP_LOW_SYSTOLIC = 90;
export const BP_LOW_DIASTOLIC = 60;

const CATEGORY_INFO: Record<BpCategory, BpCategoryInfo> = {
  low: { id: "low", label: "Low", color: "var(--series-2)" },
  normal: { id: "normal", label: "Normal", color: "var(--status-good)" },
  elevated: { id: "elevated", label: "Elevated", color: "var(--series-3)" },
  stage1: { id: "stage1", label: "Stage 1", color: "var(--status-warning)" },
  stage2: { id: "stage2", label: "Stage 2", color: "var(--status-critical)" },
  crisis: { id: "crisis", label: "Crisis", color: "var(--status-serious)" },
};

/** ACC/AHA 2017 categories, plus "Low" (under 90/60). A reading takes the
 * higher of what its systolic and diastolic each imply; a low reading that
 * isn't Stage 1 or worse counts as Low rather than Elevated. Shown for
 * reference, not as a diagnosis. */
export function bpCategory(systolic: number, diastolic: number): BpCategoryInfo {
  if (systolic > 180 || diastolic > 120) return CATEGORY_INFO.crisis;
  if (systolic >= 140 || diastolic >= 90) return CATEGORY_INFO.stage2;
  if (systolic >= 130 || diastolic >= 80) return CATEGORY_INFO.stage1;
  if (systolic < BP_LOW_SYSTOLIC || diastolic < BP_LOW_DIASTOLIC) return CATEGORY_INFO.low;
  if (systolic >= 120) return CATEGORY_INFO.elevated;
  return CATEGORY_INFO.normal;
}

/** Is this reading Stage 1 or worse — the "worth a look" threshold used
 * for the dashboard flag. */
export function bpElevated(systolic: number, diastolic: number): boolean {
  const cat = bpCategory(systolic, diastolic).id;
  return cat === "stage1" || cat === "stage2" || cat === "crisis";
}

export interface TrendPoint {
  date: string;
  value: number;
}

/** Change from the first to the last point in a series, or null if there
 * aren't two. */
export function netChange(points: TrendPoint[]): number | null {
  if (points.length < 2) return null;
  return points[points.length - 1].value - points[0].value;
}
