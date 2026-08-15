import type { CanonicalEvent } from "@/lib/types";
import { FOOD_EVIDENCE, type EvidenceTier, type FoodEvidenceEntry } from "@/lib/nutritionEvidence";
import { rankedFoods } from "./food";
import {
  digestiveSymptomItems,
  matchItem,
  MIN_INTERESTING_DIFF_PCT,
  worstSameDaySymptomDiff,
} from "./patterns";

export type PriorityLevel = "High" | "Medium" | "Low" | "Already well represented";

const LOW_INTAKE_THRESHOLD = 5; // occurrences in range, below which a group reads as "rarely logged"
const HIGH_INTAKE_THRESHOLD = 15; // above which a group reads as already well represented

function priorityFor(intakeCount: number, tier: EvidenceTier): PriorityLevel {
  if (intakeCount > HIGH_INTAKE_THRESHOLD) return "Already well represented";
  const goodEvidence = tier === "Strong" || tier === "Moderate";
  if (intakeCount < LOW_INTAKE_THRESHOLD) return goodEvidence ? "High" : "Low";
  return goodEvidence ? "Medium" : "Low";
}

export interface PriorityEntry extends FoodEvidenceEntry {
  personalIntakeCount: number;
  personalIntakeBreakdown: { item: string; count: number }[];
  priority: PriorityLevel;
  /** Combines the user's own data + the evidence tier into one cautious, personalized sentence. Never a command. */
  personalizedNote: string;
  /** Set only when a tracked-often-enough matched food shows an elevated same-day digestive-symptom association — a reason to introduce cautiously, not proof of a problem. */
  cautionNote: string | null;
}

function intakePhrase(count: number): string {
  if (count === 0) return "not logged at all";
  if (count === 1) return "logged only once";
  if (count < LOW_INTAKE_THRESHOLD) return `rarely logged (${count} times)`;
  if (count <= HIGH_INTAKE_THRESHOLD) return `logged occasionally (${count} times)`;
  return `logged regularly (${count} times)`;
}

function buildPersonalizedNote(entry: FoodEvidenceEntry, intakeCount: number, priority: PriorityLevel): string {
  const groupLower = entry.label.toLowerCase();
  if (priority === "Already well represented") {
    return `${entry.label} are already ${intakePhrase(intakeCount)} in your logged diet — no particular reason to prioritize increasing them further based on this data.`;
  }
  if (priority === "High") {
    return `${entry.label} are ${intakePhrase(intakeCount)} in your logged diet, while ${groupLower} are a food group with generally favorable nutritional evidence (${entry.evidenceTier.toLowerCase()}). They may be a reasonable group to prioritize for dietary variety — this is general dietary reasoning, not a personalized recommendation.`;
  }
  if (priority === "Medium") {
    return `${entry.label} are ${intakePhrase(intakeCount)} in your logged diet. The general evidence for this group is favorable (${entry.evidenceTier.toLowerCase()}), so there may be modest room to include them a bit more often, though you're not starting from zero.`;
  }
  return `${entry.label} are ${intakePhrase(intakeCount)} in your logged diet. The general evidence for this specific group is ${entry.evidenceTier.toLowerCase()}, so this isn't flagged as a priority despite the low tracked intake.`;
}

/**
 * Combines the user's own logged intake with the curated research table in
 * `nutritionEvidence.ts` to answer "what am I under-eating that's generally
 * worth prioritizing?" — never a bare "X is healthy" claim, and never
 * inflates a rarely-tracked food's priority beyond what its own evidence
 * tier supports. See FOOD_EVIDENCE for sourcing.
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
    const priority = priorityFor(personalIntakeCount, entry.evidenceTier);
    const personalizedNote = buildPersonalizedNote(entry, personalIntakeCount, priority);

    let cautionNote: string | null = null;
    if (symptomItems.length > 0) {
      for (const b of breakdown) {
        const worst = worstSameDaySymptomDiff(events, symptomItems, matchItem(b.item));
        if (worst.anyAdequate && worst.worstDiffPct >= MIN_INTERESTING_DIFF_PCT) {
          cautionNote = `Your own data shows an observed same-day association between ${b.item} and ${worst.worstLabel} (+${worst.worstDiffPct}pp) — worth introducing more of this group gradually and watching for a repeat, rather than assuming it's automatically well tolerated.`;
          break;
        }
      }
    }

    return {
      ...entry,
      personalIntakeCount,
      personalIntakeBreakdown: breakdown,
      priority,
      personalizedNote,
      cautionNote,
    };
  });

  const priorityOrder: Record<PriorityLevel, number> = { High: 0, Medium: 1, Low: 2, "Already well represented": 3 };
  return entries.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export interface CategoryGapEntry {
  category: string;
  personalTrackingLevel: "low" | "moderate" | "high";
  uniqueFoodsInCategory: number;
  bestEvidenceTier: EvidenceTier | null;
}

/**
 * Category-level view for "highest-priority areas to diversify": combines
 * how thin each food category is in the user's own data with whether that
 * category has research-backed entries in FOOD_EVIDENCE at all. Only
 * surfaces categories where both personal data and evidence support saying
 * something — never a bare "you don't eat category X" observation.
 */
export function categoryDiversificationGaps(events: CanonicalEvent[]): CategoryGapEntry[] {
  const ranked = rankedFoods(events);
  const byCategory = new Map<string, { count: number; unique: Set<string> }>();
  for (const f of ranked) {
    const bucket = byCategory.get(f.category) ?? { count: 0, unique: new Set<string>() };
    bucket.count += f.count;
    bucket.unique.add(f.item);
    byCategory.set(f.category, bucket);
  }

  const evidenceByCategory = new Map<string, EvidenceTier>();
  const tierRank: Record<EvidenceTier, number> = { Strong: 3, Moderate: 2, Limited: 1, Unclear: 0 };
  for (const e of FOOD_EVIDENCE) {
    const existing = evidenceByCategory.get(e.relatedFoodCategory);
    if (!existing || tierRank[e.evidenceTier] > tierRank[existing]) {
      evidenceByCategory.set(e.relatedFoodCategory, e.evidenceTier);
    }
  }

  const results: CategoryGapEntry[] = [];
  for (const [category, tier] of evidenceByCategory) {
    const bucket = byCategory.get(category);
    const count = bucket?.count ?? 0;
    const level: CategoryGapEntry["personalTrackingLevel"] = count < LOW_INTAKE_THRESHOLD ? "low" : count <= HIGH_INTAKE_THRESHOLD ? "moderate" : "high";
    if (level === "high") continue; // not a gap
    results.push({
      category,
      personalTrackingLevel: level,
      uniqueFoodsInCategory: bucket?.unique.size ?? 0,
      bestEvidenceTier: tier,
    });
  }

  const levelOrder: Record<CategoryGapEntry["personalTrackingLevel"], number> = { low: 0, moderate: 1, high: 2 };
  return results.sort((a, b) => levelOrder[a.personalTrackingLevel] - levelOrder[b.personalTrackingLevel]);
}
