import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, getDatasetSpan } from "./common";
import {
  NUTRITION_GROUP_LABEL,
  PILLAR_LABEL,
  PLANT_GROUPS,
  PRIORITY_ELIGIBLE_GROUPS,
  nutritionGroupsForFood,
  pillarForGroup,
  plantFamilyForFood,
  type NutritionGroupId,
  type PillarId,
} from "@/taxonomy/nutritionGroups";
import { evidenceForGroup } from "@/lib/nutritionEvidence";

/** Distinct food-tracked days needed before the engine trusts its own
 * ranking enough to produce priorities — below this, "never logged" is
 * indistinguishable from "hasn't logged much of anything yet". */
const MIN_FOOD_DAYS_FOR_CONFIDENCE = 10;

const RECENT_WINDOW_DAYS = 30;
const SHORT_WINDOW_DAYS = 7;
const TREND_WINDOW_DAYS = 30;
const VARIETY_WINDOW_DAYS = 90;

const CONSISTENCY_RARE_CUTOFF = 0.34;
const CONSISTENCY_OCCASIONAL_CUTOFF = 0.7;
const CONSISTENCY_CONSISTENT_CUTOFF = 1.15;

export type Consistency = "never" | "not-recent" | "rare" | "occasional" | "regular" | "consistent";
export type GroupStatus = "not-enough-data" | "priority" | "increase" | "good" | "strong";

export const STATUS_LABEL: Record<GroupStatus, string> = {
  "not-enough-data": "Not enough data",
  priority: "Priority",
  increase: "Increase",
  good: "Good",
  strong: "Strong",
};

export type DietBalanceStatus =
  | "not-enough-data"
  | "underrepresented"
  | "could-use-more-variety"
  | "well-represented"
  | "strongly-represented";

export const DIET_BALANCE_LABEL: Record<DietBalanceStatus, string> = {
  "not-enough-data": "Not enough data",
  underrepresented: "Underrepresented",
  "could-use-more-variety": "Could use more variety",
  "well-represented": "Well represented",
  "strongly-represented": "Strongly represented",
};

export interface GroupState {
  group: NutritionGroupId;
  label: string;
  pillar: PillarId;
  daysLast7: number;
  daysLast30: number;
  totalLogsAllTime: number;
  distinctFoodsLast90: string[];
  consistency: Consistency;
  status: GroupStatus;
  rateLast30PerWeek: number;
  targetPerWeek: number | null;
}

export interface Bullet {
  label: string;
  detail: string;
  /** Short suggestion phrase (e.g. "Add a legume") — null for a pillar-wide
   * statement that spans more than one group, where there's no single
   * concrete action to name. */
  action: string | null;
  /** null for a pillar-wide statement that spans more than one group —
   * there's no single evidence record that cleanly backs a merged claim. */
  group: NutritionGroupId | null;
  /** Points into src/lib/nutritionEvidenceRecords.ts. null whenever `group`
   * is null, or a group has no evidence record yet — the UI only offers a
   * "Why this is suggested" link when this is non-null. */
  evidenceId: string | null;
}

export interface PriorityCandidate {
  kind: "group" | "variety";
  headline: string;
  action: string;
  detail: string;
  exampleFoods: string[];
  score: number;
  evidenceId: string | null;
}

export interface CoverageRow {
  label: string;
  days7: number;
  days30: number;
  status: GroupStatus;
  statusLabel: string;
}

export interface DietBalanceRow {
  pillar: PillarId;
  label: string;
  status: DietBalanceStatus;
  statusLabel: string;
}

export interface PatternBuckets {
  strong: string[];
  needsVariety: string[];
  underrepresented: string[];
}

export interface VarietyMetrics {
  windowDays: number;
  totalUniqueFoods: number;
  uniquePlantFoods: number;
  plantGroupsRepresented: number;
  totalPlantGroups: number;
  uniqueVegetables: number;
  uniqueFruit: number;
  uniqueLegumes: number;
  uniqueNutsSeeds: number;
  plantFamiliesRepresented: number;
}

export interface TrendPoint {
  label: string;
  current: number;
  previous: number;
}

export interface TrendSummary {
  available: boolean;
  points: TrendPoint[];
}

export interface NutritionPriorities {
  insufficientData: boolean;
  daysWithFoodTracked: number;
  topPriorities: PriorityCandidate[];
  /** Every individual underrepresented group (never a pillar-wide rollup
   * or a variety candidate), sorted by score — the uncapped source
   * `topPriorities` itself draws its top 3 from. Kept separate so a UI
   * that wants "every underrepresented group, one line each" doesn't have
   * to reconstruct it from `missing`, which deliberately collapses a
   * fully-gapped pillar into one combined bullet instead. */
  underrepresentedGroups: PriorityCandidate[];
  doingWell: Bullet[];
  missing: Bullet[];
  coverageTable: CoverageRow[];
  groupStates: GroupState[];
  pattern: PatternBuckets;
  dietBalance: DietBalanceRow[];
  variety: VarietyMetrics;
  trend: TrendSummary;
}

function foodEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  return events.filter((e) => e.itemType === "food" && e.completed);
}

const groupCache = new Map<string, NutritionGroupId[]>();
function groupsFor(item: string): NutritionGroupId[] {
  let g = groupCache.get(item);
  if (!g) {
    g = nutritionGroupsForFood(item);
    groupCache.set(item, g);
  }
  return g;
}

function statusFromConsistency(consistency: Consistency, insufficientData: boolean): GroupStatus {
  if (insufficientData) return "not-enough-data";
  switch (consistency) {
    case "never":
    case "not-recent":
    case "rare":
      return "priority";
    case "occasional":
      return "increase";
    case "regular":
      return "good";
    case "consistent":
      return "strong";
  }
}

function bandConsistency(totalLogsAllTime: number, daysLast30: number, ratio: number): Consistency {
  if (totalLogsAllTime === 0) return "never";
  if (daysLast30 === 0) return "not-recent";
  if (ratio < CONSISTENCY_RARE_CUTOFF) return "rare";
  if (ratio < CONSISTENCY_OCCASIONAL_CUTOFF) return "occasional";
  if (ratio < CONSISTENCY_CONSISTENT_CUTOFF) return "regular";
  return "consistent";
}

/**
 * Shared engine for both a single group's state and a pillar-level
 * aggregate (e.g. "any vegetable") — the aggregate case unions events
 * across several groups rather than taking the best subgroup's own count,
 * so a day covered by leafy greens and a different day covered by other
 * vegetables both count toward "vegetables logged that day", instead of
 * whichever subgroup happens to have the higher count on its own.
 */
function computeAggregateState(
  groups: NutritionGroupId[],
  targetPerWeek: number | null,
  label: string,
  pillar: PillarId,
  foods: CanonicalEvent[],
  today: string,
  insufficientData: boolean,
): GroupState {
  const window7Start = addDaysToDate(today, -(SHORT_WINDOW_DAYS - 1));
  const window30Start = addDaysToDate(today, -(RECENT_WINDOW_DAYS - 1));
  const window90Start = addDaysToDate(today, -(VARIETY_WINDOW_DAYS - 1));

  const groupSet = new Set(groups);
  const matchEvents = foods.filter((e) => groupsFor(e.item).some((g) => groupSet.has(g)));
  const days7 = new Set(matchEvents.filter((e) => e.date >= window7Start).map((e) => e.date)).size;
  const days30 = new Set(matchEvents.filter((e) => e.date >= window30Start).map((e) => e.date)).size;
  const distinctFoodsLast90 = Array.from(
    new Set(matchEvents.filter((e) => e.date >= window90Start).map((e) => e.item)),
  );
  const totalLogsAllTime = matchEvents.length;

  const rateLast30PerWeek = (days30 * 7) / RECENT_WINDOW_DAYS;
  const ratio = targetPerWeek ? rateLast30PerWeek / targetPerWeek : 0;

  const consistency = bandConsistency(totalLogsAllTime, days30, ratio);
  const status = statusFromConsistency(consistency, insufficientData);

  return {
    group: groups[0],
    label,
    pillar,
    daysLast7: days7,
    daysLast30: days30,
    totalLogsAllTime,
    distinctFoodsLast90,
    consistency,
    status,
    rateLast30PerWeek,
    targetPerWeek,
  };
}

function computeGroupState(
  group: NutritionGroupId,
  foods: CanonicalEvent[],
  today: string,
  insufficientData: boolean,
): GroupState {
  const evidence = evidenceForGroup(group);
  return computeAggregateState(
    [group],
    evidence?.targetPerWeek ?? null,
    NUTRITION_GROUP_LABEL[group],
    pillarForGroup(group),
    foods,
    today,
    insufficientData,
  );
}

const ADD_PHRASE: Partial<Record<NutritionGroupId, string>> = {
  leafy_greens: "Add leafy greens",
  cruciferous: "Add cruciferous vegetables",
  other_vegetables: "Add more vegetable variety",
  berries: "Add berries",
  other_fruit: "Add more fruit",
  legumes: "Add a legume",
  whole_grains: "Add whole grains",
  nuts: "Add nuts",
  seeds: "Add seeds",
  fatty_fish: "Add fatty fish",
};

function groupCandidateDetail(state: GroupState): string {
  switch (state.consistency) {
    case "never":
      return "Not appearing in your tracked data.";
    case "not-recent":
      return "Logged before, but not in the last 30 days.";
    case "rare":
      return `Only appeared on ${state.daysLast30} day${state.daysLast30 === 1 ? "" : "s"} of the last 30.`;
    case "occasional":
      return `Logged on ${state.daysLast30} days of the last 30.`;
    default:
      return "";
  }
}

const VEGETABLE_VARIETY_THRESHOLD = 4;
const FRUIT_VARIETY_THRESHOLD = 3;
const NUTS_SEEDS_VARIETY_THRESHOLD = 2;

function pillarVarietyCandidate(
  pillar: PillarId,
  threshold: number,
  states: GroupState[],
  foods: CanonicalEvent[],
  today: string,
): PriorityCandidate | null {
  const subgroups = states.filter((s) => s.pillar === pillar);
  if (subgroups.length === 0) return null;

  // Frequency must already be reasonably met before "variety" is the right ask.
  const anyGoodFrequency = subgroups.some((s) => s.status === "good" || s.status === "strong");
  if (!anyGoodFrequency) return null;

  const window90Start = addDaysToDate(today, -(VARIETY_WINDOW_DAYS - 1));
  const pillarGroups = new Set(subgroups.map((s) => s.group));
  const pillarEvents = foods.filter((e) => e.date >= window90Start && groupsFor(e.item).some((g) => pillarGroups.has(g)));
  const distinctFoods = new Set(pillarEvents.map((e) => e.item));
  if (distinctFoods.size >= threshold) return null;

  const counts = new Map<string, number>();
  for (const e of pillarEvents) counts.set(e.item, (counts.get(e.item) ?? 0) + 1);
  const topFoods = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([item]) => item);

  const gapScore = Math.max(0, 1 - distinctFoods.size / threshold);
  const pillarLabel = PILLAR_LABEL[pillar];

  return {
    kind: "variety",
    headline: pillarLabel,
    action: `Increase ${pillarLabel.toLowerCase()} variety`,
    detail:
      topFoods.length > 0
        ? `Good frequency, but most of your ${pillarLabel.toLowerCase()} comes from ${topFoods.join(", ").toLowerCase()}.`
        : `Good frequency, but a narrow range of foods so far.`,
    exampleFoods: [],
    score: gapScore,
    // Spans every subgroup in the pillar rather than one group, so there's
    // no single evidence record that cleanly backs this specific claim.
    evidenceId: null,
  };
}

function pillarSentenceForGoodGroups(pillar: PillarId, states: GroupState[]): Bullet {
  const label = PILLAR_LABEL[pillar];
  const anyStrong = states.some((s) => s.status === "strong");
  return {
    label,
    detail: anyStrong ? "Consistently represented in your data." : "Logged regularly.",
    action: null,
    group: null,
    evidenceId: null,
  };
}

function groupWellSentence(state: GroupState): Bullet {
  return {
    label: state.label,
    detail: state.status === "strong" ? "Consistently represented in your data." : "Logged regularly.",
    action: null,
    group: state.group,
    evidenceId: evidenceForGroup(state.group)?.evidenceId ?? null,
  };
}

/**
 * Main entry point: everything the Food page's decision-oriented sections
 * need, in one pass over the (unfiltered) canonical events. Always operates
 * on the full dataset rather than whatever date range the page's filter is
 * set to — "what should I prioritize now" shouldn't change because someone
 * happened to narrow the chart below it to last month.
 */
export function computeNutritionPriorities(events: CanonicalEvent[]): NutritionPriorities {
  const span = getDatasetSpan(events);
  const foods = foodEvents(events);

  const emptyVariety: VarietyMetrics = {
    windowDays: VARIETY_WINDOW_DAYS,
    totalUniqueFoods: 0,
    uniquePlantFoods: 0,
    plantGroupsRepresented: 0,
    totalPlantGroups: PLANT_GROUPS.length,
    uniqueVegetables: 0,
    uniqueFruit: 0,
    uniqueLegumes: 0,
    uniqueNutsSeeds: 0,
    plantFamiliesRepresented: 0,
  };

  if (!span || foods.length === 0) {
    return {
      insufficientData: true,
      daysWithFoodTracked: 0,
      topPriorities: [],
      underrepresentedGroups: [],
      doingWell: [],
      missing: [],
      coverageTable: [],
      groupStates: [],
      pattern: { strong: [], needsVariety: [], underrepresented: [] },
      dietBalance: [],
      variety: emptyVariety,
      trend: { available: false, points: [] },
    };
  }

  const today = span.end;
  const daysWithFoodTracked = new Set(foods.map((e) => e.date)).size;
  const insufficientData = daysWithFoodTracked < MIN_FOOD_DAYS_FOR_CONFIDENCE;

  const allGroupStates = PRIORITY_ELIGIBLE_GROUPS.map((g) => computeGroupState(g, foods, today, insufficientData));
  const otherSeafoodState = computeGroupState("other_seafood", foods, today, insufficientData);

  // ---- Priority candidates (group gaps + pillar variety gaps) ----
  const groupCandidates: PriorityCandidate[] = allGroupStates
    .filter((s) => s.status === "priority" || s.status === "increase")
    .map((s) => {
      const evidence = evidenceForGroup(s.group);
      return {
        kind: "group" as const,
        headline: s.label,
        action: ADD_PHRASE[s.group] ?? `Add ${s.label.toLowerCase()}`,
        detail: groupCandidateDetail(s),
        exampleFoods: evidence?.exampleFoods ?? [],
        score: Math.max(0, 1 - s.rateLast30PerWeek / (s.targetPerWeek ?? 1)) * (evidence?.weight ?? 1),
        evidenceId: evidence?.evidenceId ?? null,
      };
    });

  // Special-case: eats fish generally, but fatty fish specifically lags —
  // replaces the generic fatty_fish bullet with a more precise one.
  const fattyFishIdx = groupCandidates.findIndex((c) => c.headline === NUTRITION_GROUP_LABEL.fatty_fish);
  if (fattyFishIdx >= 0 && otherSeafoodState.daysLast30 >= 4) {
    groupCandidates[fattyFishIdx] = {
      ...groupCandidates[fattyFishIdx],
      detail: "You eat fish, but fatty fish specifically (salmon, mackerel, sardines) isn't regularly represented.",
    };
  }

  const varietyCandidates = [
    pillarVarietyCandidate("vegetables", VEGETABLE_VARIETY_THRESHOLD, allGroupStates, foods, today),
    pillarVarietyCandidate("fruit", FRUIT_VARIETY_THRESHOLD, allGroupStates, foods, today),
    pillarVarietyCandidate("nuts_seeds", NUTS_SEEDS_VARIETY_THRESHOLD, allGroupStates, foods, today),
  ].filter((c): c is PriorityCandidate => c !== null);

  const sortedGroupCandidates = [...groupCandidates].sort((a, b) => b.score - a.score);
  const topPriorities = insufficientData
    ? []
    : [...groupCandidates, ...varietyCandidates].sort((a, b) => b.score - a.score).slice(0, 3);

  // ---- Doing well / missing, built pillar-by-pillar so a mixed pillar
  // (e.g. good other-vegetables, rare cruciferous) names the specific gap
  // rather than a vague pillar-wide verdict. ----
  const CORE_PILLARS: PillarId[] = ["vegetables", "fruit", "legumes", "grains", "nuts_seeds", "fish"];
  const doingWell: Bullet[] = [];
  const missing: Bullet[] = [];

  if (!insufficientData) {
    for (const pillar of CORE_PILLARS) {
      const subgroups = allGroupStates.filter((s) => s.pillar === pillar);
      if (subgroups.length === 0) continue;

      const goodOnes = subgroups.filter((s) => s.status === "good" || s.status === "strong");
      const gapOnes = subgroups.filter((s) => s.status === "priority" || s.status === "increase");

      if (goodOnes.length === subgroups.length && subgroups.length > 1) {
        doingWell.push(pillarSentenceForGoodGroups(pillar, subgroups));
      } else {
        for (const s of goodOnes) doingWell.push(groupWellSentence(s));
      }

      if (pillar === "fish" && gapOnes.some((s) => s.group === "fatty_fish") && otherSeafoodState.daysLast30 >= 4) {
        missing.push({
          label: "Fatty fish",
          detail: "You eat fish, but fatty fish specifically isn't regularly represented.",
          action: ADD_PHRASE.fatty_fish ?? null,
          group: "fatty_fish",
          evidenceId: evidenceForGroup("fatty_fish")?.evidenceId ?? null,
        });
      } else if (gapOnes.length === subgroups.length && subgroups.length > 1) {
        missing.push({
          label: PILLAR_LABEL[pillar],
          detail: `Underrepresented overall — ${subgroups.map((s) => s.label.toLowerCase()).join(", ")} are all rarely or never logged.`,
          // Spans multiple subgroups — no single action/evidence record fits.
          action: null,
          group: null,
          evidenceId: null,
        });
      } else {
        for (const s of gapOnes) {
          missing.push({
            label: s.label,
            detail: groupCandidateDetail(s),
            action: ADD_PHRASE[s.group] ?? `Add ${s.label.toLowerCase()}`,
            group: s.group,
            evidenceId: evidenceForGroup(s.group)?.evidenceId ?? null,
          });
        }
      }
    }

    for (const cand of varietyCandidates) {
      missing.push({ label: `${cand.headline} variety`, detail: cand.detail, action: cand.action, group: null, evidenceId: null });
    }
  }

  // ---- Coverage table: the fixed compact set from the design brief ----
  const byGroup = new Map(allGroupStates.map((s) => [s.group, s]));
  const vegState = computeAggregateState(
    ["leafy_greens", "cruciferous", "other_vegetables"],
    7,
    "Vegetables (overall)",
    "vegetables",
    foods,
    today,
    insufficientData,
  );
  const fruitState = computeAggregateState(["berries", "other_fruit"], 7, "Fruit (overall)", "fruit", foods, today, insufficientData);
  const nutsSeedsState = computeAggregateState(["nuts", "seeds"], 5, "Nuts & seeds", "nuts_seeds", foods, today, insufficientData);

  const coverageTable: CoverageRow[] = [
    rowFor("Leafy greens", byGroup.get("leafy_greens")!),
    rowFor("Berries", byGroup.get("berries")!),
    rowFor("Legumes", byGroup.get("legumes")!),
    rowFor("Whole grains", byGroup.get("whole_grains")!),
    rowFor("Nuts & seeds", nutsSeedsState),
    rowFor("Fatty fish", byGroup.get("fatty_fish")!),
    rowFor("Vegetables (overall)", vegState),
    rowFor("Fruit (overall)", fruitState),
  ];

  // ---- Eating pattern buckets (item 9) — derived from the same states ----
  const pattern: PatternBuckets = { strong: [], needsVariety: [], underrepresented: [] };
  if (!insufficientData) {
    for (const cand of varietyCandidates) pattern.needsVariety.push(cand.headline);
    for (const s of allGroupStates) {
      if (s.status === "strong") pattern.strong.push(s.label);
      else if (s.status === "priority" || s.status === "increase") pattern.underrepresented.push(s.label);
    }
  }

  // ---- Diet balance (item 10 vocabulary) — keyed off the same union-based
  // aggregate state as the coverage table, so this never contradicts what
  // "What you're missing" says about the same pillar. ----
  const aggregateStateByPillar: Partial<Record<PillarId, GroupState>> = {
    vegetables: vegState,
    fruit: fruitState,
    legumes: byGroup.get("legumes"),
    grains: byGroup.get("whole_grains"),
    nuts_seeds: nutsSeedsState,
    fish: byGroup.get("fatty_fish"),
  };
  const dietBalance: DietBalanceRow[] = CORE_PILLARS.map((pillar) =>
    dietBalanceRow(pillar, aggregateStateByPillar[pillar]!, varietyCandidates, insufficientData),
  );

  // ---- Variety metrics ----
  const window90Start = addDaysToDate(today, -(VARIETY_WINDOW_DAYS - 1));
  const recentFoods = foods.filter((e) => e.date >= window90Start);
  const totalUniqueFoods = new Set(recentFoods.map((e) => e.item)).size;

  const plantItems = new Set<string>();
  const plantGroupsSeen = new Set<NutritionGroupId>();
  const vegItems = new Set<string>();
  const fruitItems = new Set<string>();
  const legumeItems = new Set<string>();
  const nutSeedItems = new Set<string>();
  const families = new Set<string>();
  for (const e of recentFoods) {
    const groups = groupsFor(e.item);
    for (const g of groups) {
      if (PLANT_GROUPS.includes(g)) {
        plantItems.add(e.item);
        plantGroupsSeen.add(g);
      }
      if (g === "leafy_greens" || g === "cruciferous" || g === "other_vegetables") vegItems.add(e.item);
      if (g === "berries" || g === "other_fruit") fruitItems.add(e.item);
      if (g === "legumes") legumeItems.add(e.item);
      if (g === "nuts" || g === "seeds") nutSeedItems.add(e.item);
    }
    const family = plantFamilyForFood(e.item);
    if (family) families.add(family);
  }

  const variety: VarietyMetrics = {
    windowDays: VARIETY_WINDOW_DAYS,
    totalUniqueFoods,
    uniquePlantFoods: plantItems.size,
    plantGroupsRepresented: plantGroupsSeen.size,
    totalPlantGroups: PLANT_GROUPS.length,
    uniqueVegetables: vegItems.size,
    uniqueFruit: fruitItems.size,
    uniqueLegumes: legumeItems.size,
    uniqueNutsSeeds: nutSeedItems.size,
    plantFamiliesRepresented: families.size,
  };

  // ---- Longitudinal trend: last 30 days vs. the 30 before that ----
  const spanDays = dayDiff(span.start, span.end) + 1;
  const trendAvailable = spanDays >= TREND_WINDOW_DAYS * 2;
  let trend: TrendSummary = { available: false, points: [] };
  if (trendAvailable) {
    const currentStart = addDaysToDate(today, -(TREND_WINDOW_DAYS - 1));
    const previousEnd = addDaysToDate(currentStart, -1);
    const previousStart = addDaysToDate(previousEnd, -(TREND_WINDOW_DAYS - 1));

    const currentFoods = foods.filter((e) => e.date >= currentStart && e.date <= today);
    const previousFoods = foods.filter((e) => e.date >= previousStart && e.date <= previousEnd);

    const uniquePlants = (list: CanonicalEvent[]) =>
      new Set(list.filter((e) => groupsFor(e.item).some((g) => PLANT_GROUPS.includes(g))).map((e) => e.item)).size;
    const uniqueVeg = (list: CanonicalEvent[]) =>
      new Set(
        list
          .filter((e) => groupsFor(e.item).some((g) => g === "leafy_greens" || g === "cruciferous" || g === "other_vegetables"))
          .map((e) => e.item),
      ).size;
    const exposureDays = (list: CanonicalEvent[], group: NutritionGroupId) =>
      new Set(list.filter((e) => groupsFor(e.item).includes(group)).map((e) => e.date)).size;
    const coverageCount = (list: CanonicalEvent[]) =>
      PRIORITY_ELIGIBLE_GROUPS.filter((g) => list.some((e) => groupsFor(e.item).includes(g))).length;

    trend = {
      available: true,
      points: [
        { label: "Plant diversity (unique plant foods)", current: uniquePlants(currentFoods), previous: uniquePlants(previousFoods) },
        { label: "Vegetable diversity (unique vegetables)", current: uniqueVeg(currentFoods), previous: uniqueVeg(previousFoods) },
        { label: "Berry exposure (days)", current: exposureDays(currentFoods, "berries"), previous: exposureDays(previousFoods, "berries") },
        { label: "Legume exposure (days)", current: exposureDays(currentFoods, "legumes"), previous: exposureDays(previousFoods, "legumes") },
        { label: "Whole-grain exposure (days)", current: exposureDays(currentFoods, "whole_grains"), previous: exposureDays(previousFoods, "whole_grains") },
        { label: "Fatty-fish exposure (days)", current: exposureDays(currentFoods, "fatty_fish"), previous: exposureDays(previousFoods, "fatty_fish") },
        { label: "Nut/seed exposure (days)", current: exposureDays(currentFoods, "nuts") + exposureDays(currentFoods, "seeds"), previous: exposureDays(previousFoods, "nuts") + exposureDays(previousFoods, "seeds") },
        { label: "Food groups covered (of 10 tracked)", current: coverageCount(currentFoods), previous: coverageCount(previousFoods) },
      ],
    };
  }

  return {
    insufficientData,
    daysWithFoodTracked,
    topPriorities,
    underrepresentedGroups: insufficientData ? [] : sortedGroupCandidates,
    doingWell,
    missing,
    coverageTable,
    groupStates: allGroupStates,
    pattern,
    dietBalance,
    variety,
    trend,
  };
}

function rowFor(label: string, state: GroupState): CoverageRow {
  return {
    label,
    days7: state.daysLast7,
    days30: state.daysLast30,
    status: state.status,
    statusLabel: STATUS_LABEL[state.status],
  };
}

/**
 * Keyed off the same union-based aggregate state used for the coverage
 * table (single group for single-subgroup pillars) so this never
 * contradicts "What you're missing" for the same pillar.
 */
function dietBalanceRow(
  pillar: PillarId,
  aggregate: GroupState,
  varietyCandidates: PriorityCandidate[],
  insufficientData: boolean,
): DietBalanceRow {
  const label = PILLAR_LABEL[pillar];
  if (insufficientData) return { pillar, label, status: "not-enough-data", statusLabel: DIET_BALANCE_LABEL["not-enough-data"] };

  const frequencyGood = aggregate.status === "good" || aggregate.status === "strong";
  const hasVarietyConcern = varietyCandidates.some((c) => c.headline === label);

  let status: DietBalanceStatus;
  if (!frequencyGood) {
    status = "underrepresented";
  } else if (hasVarietyConcern) {
    status = "could-use-more-variety";
  } else if (aggregate.status === "strong") {
    status = "strongly-represented";
  } else {
    status = "well-represented";
  }

  return { pillar, label, status, statusLabel: DIET_BALANCE_LABEL[status] };
}

function dayDiff(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}
