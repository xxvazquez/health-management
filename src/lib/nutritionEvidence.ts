import type { NutritionGroupId } from "@/taxonomy/nutritionGroups";

/**
 * Internal nutrition-knowledge layer: what the priorities engine treats as
 * broadly worth emphasizing, and how strongly. This is deliberately not a
 * study database — no individual papers, DOIs, or mechanisms are modeled
 * here, and none of this is ever rendered as reading material in the UI.
 *
 * Each entry reflects the settled position of major dietary guidelines and
 * systematic-review-level evidence (USDA Dietary Guidelines, WHO, AHA
 * seafood/omega-3 guidance, Mediterranean-diet trial evidence, EAT-Lancet),
 * not any single study — the hierarchy item 14 of the design asked for:
 * guideline consensus first, meta-analyses/cohorts second, individual RCTs
 * only as supporting color, never decisive on their own. One exciting paper
 * should never move a weight here.
 *
 * `weight` (0-1) is a soft strength multiplier used by the priorities
 * engine — it differentiates "well-established, quantifiable target"
 * groups from "directionally favorable but less precisely quantified"
 * ones. Nothing in the priority-eligible set is weak enough to be excluded
 * outright; low personal intake is always what actually drives a
 * recommendation; the weight only breaks ties between comparably
 * under-represented groups.
 *
 * `targetPerWeek` is a practical, food-frequency (not gram/serving) target
 * used only to judge whether logging is rare/occasional/regular/consistent
 * — never surfaced as a hard number the user is failing to hit. Sourced
 * from the closest defensible guideline anchor:
 *  - vegetables/fruit/whole grains: "most days, ideally daily" per USDA/WHO
 *  - legumes: "several times a week" per Mediterranean-diet & EAT-Lancet guidance
 *  - nuts: ≥5x/week, the threshold used in the large nut-cohort literature
 *  - fatty fish: ≥2x/week per the AHA seafood science advisory
 */
export type EvidenceTier = "Strong" | "Moderate";

export interface GroupEvidence {
  tier: EvidenceTier;
  weight: number;
  targetPerWeek: number;
  /** Generic, widely available examples — used for suggestion copy, never for matching. */
  exampleFoods: string[];
  /** Points into src/lib/nutritionEvidenceRecords.ts — the actual cited
   * research, shown only behind the Food page's "Why this is suggested"
   * link, never inline here or in the main analytics UI. */
  evidenceId: string;
}

const GROUP_EVIDENCE: Partial<Record<NutritionGroupId, GroupEvidence>> = {
  leafy_greens: { tier: "Strong", weight: 1.0, targetPerWeek: 4, exampleFoods: ["spinach", "kale", "lettuce"], evidenceId: "leafy_greens_evidence" },
  cruciferous: { tier: "Strong", weight: 1.0, targetPerWeek: 3, exampleFoods: ["broccoli", "cauliflower", "cabbage"], evidenceId: "cruciferous_evidence" },
  red_orange_veg: { tier: "Moderate", weight: 0.8, targetPerWeek: 4, exampleFoods: ["carrot", "sweet potato", "tomato"], evidenceId: "red_orange_veg_evidence" },
  alliums: { tier: "Moderate", weight: 0.7, targetPerWeek: 4, exampleFoods: ["onion", "garlic", "leek"], evidenceId: "alliums_evidence" },
  other_vegetables: { tier: "Strong", weight: 1.0, targetPerWeek: 4, exampleFoods: ["cucumber", "courgette", "mushroom"], evidenceId: "other_vegetables_evidence" },
  berries: { tier: "Moderate", weight: 0.85, targetPerWeek: 3, exampleFoods: ["blueberries", "raspberries", "strawberries"], evidenceId: "berries_evidence" },
  citrus: { tier: "Moderate", weight: 0.75, targetPerWeek: 3, exampleFoods: ["orange", "grapefruit", "mandarin"], evidenceId: "citrus_evidence" },
  other_fruit: { tier: "Strong", weight: 1.0, targetPerWeek: 4, exampleFoods: ["apple", "banana", "grapes"], evidenceId: "other_fruit_evidence" },
  legumes: { tier: "Strong", weight: 1.0, targetPerWeek: 3, exampleFoods: ["lentils", "chickpeas", "beans"], evidenceId: "legumes_evidence" },
  whole_grains: { tier: "Strong", weight: 1.0, targetPerWeek: 7, exampleFoods: ["oats", "quinoa", "buckwheat"], evidenceId: "whole_grains_evidence" },
  nuts: { tier: "Strong", weight: 1.0, targetPerWeek: 5, exampleFoods: ["almonds", "walnuts", "peanut butter"], evidenceId: "nuts_evidence" },
  seeds: { tier: "Moderate", weight: 0.85, targetPerWeek: 5, exampleFoods: ["chia", "flaxseed", "sesame seeds"], evidenceId: "seeds_evidence" },
  fatty_fish: { tier: "Strong", weight: 1.0, targetPerWeek: 2, exampleFoods: ["salmon", "mackerel", "sardines"], evidenceId: "fatty_fish_evidence" },
};

export function evidenceForGroup(group: NutritionGroupId): GroupEvidence | null {
  return GROUP_EVIDENCE[group] ?? null;
}
