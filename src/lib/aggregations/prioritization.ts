import type { CanonicalEvent } from "@/lib/types";
import type { FoodCategory } from "@/taxonomy/categories";
import { FOOD_EVIDENCE, type EvidenceTier, type EvidenceSource } from "@/lib/nutritionEvidence";
import { rankedFoods } from "./food";
import {
  digestiveSymptomItems,
  matchItem,
  MIN_INTERESTING_DIFF_PCT,
  worstSameDaySymptomDiff,
} from "./patterns";

const HIGH_INTAKE_THRESHOLD = 15; // above which a group reads as already well represented
const EXAMPLE_FOODS_SHOWN = 3;

export type PriorityAction = "Increase" | "Maintain" | "Skip";

export interface PriorityEntry {
  label: string;
  relatedFoodCategory: FoodCategory;
  evidenceTier: EvidenceTier;
  summary: string;
  mechanismOrFinding: string;
  sources: EvidenceSource[];
  personalIntakeCount: number;
  /** Concrete foods to show instead of just the abstract group name — the
   * ones actually logged, or the group's typical examples if never logged. */
  exampleFoods: string[];
  action: PriorityAction;
  /** One short sentence — personal-data findings (e.g. a symptom
   * association) take priority over the generic evidence summary. */
  why: string;
}

/**
 * Evidence strength gates whether a group is worth prioritizing at all —
 * low intake alone never overrides weak evidence. Among groups with
 * favorable evidence, intake level decides Increase vs. Maintain.
 */
function actionFor(intakeCount: number, tier: EvidenceTier): PriorityAction {
  if (tier === "Limited" || tier === "Unclear") return "Skip";
  if (intakeCount > HIGH_INTAKE_THRESHOLD) return "Maintain";
  return "Increase";
}

function buildWhy(action: PriorityAction, intakeCount: number, tier: EvidenceTier, caution: string | null): string {
  if (caution) return caution;
  if (action === "Skip") return `${tier} evidence for this group — not worth prioritizing over what you're already eating.`;
  if (action === "Maintain") return "Already eaten regularly, and the general evidence is favorable — keep it up.";
  return intakeCount === 0
    ? "Not logged yet, and the general evidence is favorable."
    : "Rarely logged so far, and the general evidence is favorable.";
}

/**
 * Combines the user's own logged intake with the curated research table in
 * `nutritionEvidence.ts` to answer, in one glance, "what should I eat more
 * of, keep doing, or not worry about?" — grouped by action rather than a
 * long uniform list. Never inflates a rarely-tracked food's priority beyond
 * what its own evidence tier supports. See FOOD_EVIDENCE for sourcing.
 */
export function foodsWorthPrioritizing(events: CanonicalEvent[]): PriorityEntry[] {
  const rankedByItem = new Map(rankedFoods(events).map((f) => [f.item, f.count]));
  const symptomItems = digestiveSymptomItems(events);

  const entries = FOOD_EVIDENCE.map((entry) => {
    const breakdown = entry.matchFoodNames
      .map((item) => ({ item, count: rankedByItem.get(item) ?? 0 }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);
    const personalIntakeCount = breakdown.reduce((sum, b) => sum + b.count, 0);
    const action = actionFor(personalIntakeCount, entry.evidenceTier);

    const exampleFoods = (breakdown.length > 0 ? breakdown.map((b) => b.item) : entry.matchFoodNames).slice(
      0,
      EXAMPLE_FOODS_SHOWN,
    );

    let caution: string | null = null;
    if (symptomItems.length > 0) {
      for (const b of breakdown) {
        const worst = worstSameDaySymptomDiff(events, symptomItems, matchItem(b.item));
        if (worst.anyAdequate && worst.worstDiffPct >= MIN_INTERESTING_DIFF_PCT) {
          caution = `Your data shows ${b.item} linked to ${worst.worstLabel} (+${worst.worstDiffPct}pp) — worth introducing gradually.`;
          break;
        }
      }
    }

    return {
      label: entry.label,
      relatedFoodCategory: entry.relatedFoodCategory,
      evidenceTier: entry.evidenceTier,
      summary: entry.summary,
      mechanismOrFinding: entry.mechanismOrFinding,
      sources: entry.sources,
      personalIntakeCount,
      exampleFoods,
      action,
      why: buildWhy(action, personalIntakeCount, entry.evidenceTier, caution),
    };
  });

  const actionOrder: Record<PriorityAction, number> = { Increase: 0, Maintain: 1, Skip: 2 };
  return entries.sort((a, b) => actionOrder[a.action] - actionOrder[b.action]);
}
