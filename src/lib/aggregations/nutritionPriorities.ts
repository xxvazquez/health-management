import type { CanonicalEvent } from "@/lib/types";
import { addDaysToDate, daysBetween, getDatasetSpan, type DateRange } from "./common";
import {
  CORE_FRUIT_GROUPS,
  CORE_VEGETABLE_GROUPS,
  NUTRITION_GROUP_EXAMPLES,
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

/** Distinct food-tracked days needed, WITHIN THE SELECTED RANGE, before the
 * engine trusts its own ranking enough to produce priorities — below this,
 * "never logged" is indistinguishable from "hasn't logged much of anything
 * yet". A short range (e.g. "This week") will often land here, which is
 * correct: a week of data isn't enough to judge a pattern of eating. */
const MIN_FOOD_DAYS_FOR_CONFIDENCE = 10;

const CONSISTENCY_RARE_CUTOFF = 0.34;
const CONSISTENCY_OCCASIONAL_CUTOFF = 0.7;
const CONSISTENCY_CONSISTENT_CUTOFF = 1.15;

type Consistency = "never" | "not-recent" | "rare" | "occasional" | "regular" | "consistent";
export type GroupStatus = "not-enough-data" | "priority" | "increase" | "good" | "strong";

/** One vocabulary for "how well-represented is this in what you log",
 * shared with DIET_BALANCE_LABEL below so the per-group coverage table and
 * the per-pillar diet-balance verdict read in the same voice. The two
 * scales differ only at the middle rung: a group can be logged too seldom
 * ("Could log more often"), a pillar can be logged enough but from too few
 * foods ("Could use more variety"). */
const STATUS_LABEL: Record<GroupStatus, string> = {
  "not-enough-data": "Not enough data",
  priority: "Underrepresented",
  increase: "Could log more often",
  good: "Well represented",
  strong: "Strongly represented",
};

export type DietBalanceStatus =
  | "not-enough-data"
  | "underrepresented"
  | "could-use-more-variety"
  | "well-represented"
  | "strongly-represented";

/** Shares its wording with STATUS_LABEL — "Underrepresented" / "Well
 * represented" / "Strongly represented" mean the same thing on both. */
const DIET_BALANCE_LABEL: Record<DietBalanceStatus, string> = {
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
  /** Distinct days this group was logged, within the selected range. */
  daysInRange: number;
  /** Length of the selected range in days — carried on the state so display
   * code (groupCandidateDetail) can describe `daysInRange` against it
   * without threading the range through separately. */
  rangeLengthDays: number;
  /** Ever logged, across the full dataset — not scoped to the range. Keeps
   * "never eaten, ever" distinguishable from "eaten before, just not within
   * this range" (the `not-recent` consistency band). */
  totalLogsAllTime: number;
  distinctFoodsInRange: string[];
  consistency: Consistency;
  status: GroupStatus;
  rateInRangePerWeek: number;
  targetPerWeek: number | null;
}

interface BulletFrequency {
  /** Distinct days the group was logged, within the selected range. */
  daysInRange: number;
  /** Length of the selected range in days — the denominator. */
  rangeLengthDays: number;
  /** `daysInRange / rangeLengthDays`, 0–100, rounded. */
  percent: number;
  /** A few member foods, for a muted sub-line under the group name. */
  examples: string[];
  /** The group was never logged in the range at all (`daysInRange === 0`). */
  notTracked: boolean;
}

interface Bullet {
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
  /** Set for single-group bullets: the numbers behind `detail`, so the UI
   * can draw a meter row instead of reading the sentence. Absent on
   * pillar-wide rollups and variety bullets, which have no one figure. */
  frequency?: BulletFrequency;
}

interface PriorityCandidate {
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
  daysInRange: number;
  status: GroupStatus;
  statusLabel: string;
}

interface DietBalanceRow {
  pillar: PillarId;
  label: string;
  status: DietBalanceStatus;
  statusLabel: string;
}

/** One row of the Food Overview's balance card: a per-pillar verdict with
 * the frequency numbers behind it. The card lists all six core pillars
 * worst-represented first.
 *
 * `percentOfTarget` — not a raw "days logged / days in range" figure — is
 * `rateInRangePerWeek / targetPerWeek`, the same ratio `status` is derived
 * from (see `bandConsistency`). Pillars have very different weekly targets
 * (fatty fish 2×/week, whole grains 7×/week, …), so a raw day-coverage
 * percentage and the verdict can look unrelated at a glance — e.g. fish
 * logged on 30 of 76 days (39% of days) is genuinely "strongly
 * represented" against its lower target, while grains at a higher 53% of
 * days is still "underrepresented" against a daily target. Showing
 * progress-toward-target instead keeps the number and the verdict reading
 * the same way for every pillar. */
export interface PillarRow {
  pillar: PillarId;
  label: string;
  /** Distinct days any core group in the pillar was logged, within range. */
  daysInRange: number;
  rangeLengthDays: number;
  /** This pillar's average weekly rate within the range. */
  rateInRangePerWeek: number;
  /** The pillar's own weekly target this rate is judged against. */
  targetPerWeek: number;
  /** `rateInRangePerWeek / targetPerWeek`, 0–100+, rounded — see this
   * interface's own doc comment for why it's target-relative, not a raw
   * day-coverage percentage. */
  percentOfTarget: number;
  status: DietBalanceStatus;
  statusLabel: string;
  /** Nothing from this pillar logged in the range (`daysInRange === 0`). */
  notTracked: boolean;
}

/** Worst first, so the pillar card sorts the same way it's meant to read. */
const PILLAR_SEVERITY: Record<DietBalanceStatus, number> = {
  underrepresented: 0,
  "could-use-more-variety": 1,
  "well-represented": 2,
  "strongly-represented": 3,
  "not-enough-data": 4,
};

interface VarietyMetrics {
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

interface TrendPoint {
  label: string;
  current: number;
  previous: number;
}

interface TrendSummary {
  available: boolean;
  /** Length of the selected range (= the prior comparison window too) —
   * lets the UI say "vs. the N days before" without hardcoding a number. */
  rangeLengthDays: number;
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
  /** The six core pillars, worst-represented first — the Food Overview's
   * one balance card. */
  pillars: PillarRow[];
  variety: VarietyMetrics;
  trend: TrendSummary;
  /** The selected range in a couple of words for a card header, e.g.
   * "11 weeks" / "6 months" — empty when there's not enough data. */
  rangeLabel: string;
}

function foodEvents(events: CanonicalEvent[]): CanonicalEvent[] {
  // Spices/seasonings are logged for completeness but say nothing about how
  // someone actually eats — excluded from every priority, coverage and
  // variety metric here so a cupboard of dried herbs can't inflate them.
  return events.filter((e) => e.itemType === "food" && e.completed && e.category !== "Spices");
}

// `currentOverrides` and `groupCache` are reset at the top of every
// computeNutritionPriorities call (its own doc comment explains why) — safe
// because every other function in this file is a private helper only ever
// called synchronously, within one such call, never re-entrantly.
let currentOverrides: Record<string, NutritionGroupId> = {};
const groupCache = new Map<string, NutritionGroupId[]>();
function groupsFor(item: string): NutritionGroupId[] {
  let g = groupCache.get(item);
  if (!g) {
    g = nutritionGroupsForFood(item, currentOverrides);
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

function bandConsistency(totalLogsAllTime: number, daysInRange: number, ratio: number): Consistency {
  if (totalLogsAllTime === 0) return "never";
  if (daysInRange === 0) return "not-recent";
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
 *
 * Everything here is scoped to the SELECTED RANGE (`range`), except
 * `totalLogsAllTime`, which deliberately reads the full `foods` list — the
 * one place "ever logged at all" needs to stay independent of whatever
 * range is currently selected, so "never eaten" and "eaten before, just
 * not in this range" stay distinguishable regardless of range length.
 */
function computeAggregateState(
  groups: NutritionGroupId[],
  targetPerWeek: number | null,
  label: string,
  pillar: PillarId,
  foods: CanonicalEvent[],
  range: DateRange,
  insufficientData: boolean,
): GroupState {
  const rangeLengthDays = daysBetween(range.start, range.end) + 1;
  const groupSet = new Set(groups);
  const matchEvents = foods.filter((e) => groupsFor(e.item).some((g) => groupSet.has(g)));
  const inRangeEvents = matchEvents.filter((e) => e.date >= range.start && e.date <= range.end);
  const daysInRange = new Set(inRangeEvents.map((e) => e.date)).size;
  const distinctFoodsInRange = Array.from(new Set(inRangeEvents.map((e) => e.item)));
  const totalLogsAllTime = matchEvents.length;

  const rateInRangePerWeek = (daysInRange * 7) / rangeLengthDays;
  const ratio = targetPerWeek ? rateInRangePerWeek / targetPerWeek : 0;

  const consistency = bandConsistency(totalLogsAllTime, daysInRange, ratio);
  const status = statusFromConsistency(consistency, insufficientData);

  return {
    group: groups[0],
    label,
    pillar,
    daysInRange,
    rangeLengthDays,
    totalLogsAllTime,
    distinctFoodsInRange,
    consistency,
    status,
    rateInRangePerWeek,
    targetPerWeek,
  };
}

function computeGroupState(group: NutritionGroupId, foods: CanonicalEvent[], range: DateRange, insufficientData: boolean): GroupState {
  const evidence = evidenceForGroup(group);
  return computeAggregateState([group], evidence?.targetPerWeek ?? null, NUTRITION_GROUP_LABEL[group], pillarForGroup(group), foods, range, insufficientData);
}

const ADD_PHRASE: Partial<Record<NutritionGroupId, string>> = {
  leafy_greens: "Add leafy greens",
  cruciferous: "Add cruciferous vegetables",
  red_orange_veg: "Add red & orange veg",
  alliums: "Add onions, garlic or leeks",
  other_vegetables: "Add more vegetable variety",
  berries: "Add berries",
  citrus: "Add citrus fruit",
  other_fruit: "Add more fruit",
  legumes: "Add a legume",
  whole_grains: "Add whole grains",
  nuts: "Add nuts",
  seeds: "Add seeds",
  fatty_fish: "Add fatty fish",
};

/** "the past 3 weeks" / "the past month" / "the past 6 months" — a plain
 * reading of the selected range's length, so a sentence can name it
 * instead of the vague "in this range". */
function rangeInWords(days: number): string {
  if (days <= 1) return "the past day";
  if (days < 14) return `the past ${days} days`;
  if (days >= 28 && days <= 31) return "the past month";
  if (days < 84) return `the past ${Math.round(days / 7)} weeks`;
  if (days < 320) return `the past ${Math.round(days / 30)} months`;
  if (days < 400) return "the past year";
  return `the past ${Math.round(days / 365)} years`;
}

function bulletFrequency(state: GroupState): BulletFrequency {
  return {
    daysInRange: state.daysInRange,
    rangeLengthDays: state.rangeLengthDays,
    percent: state.rangeLengthDays > 0 ? Math.round((state.daysInRange / state.rangeLengthDays) * 100) : 0,
    examples: NUTRITION_GROUP_EXAMPLES[state.group].split(", "),
    notTracked: state.daysInRange === 0,
  };
}

function groupCandidateDetail(state: GroupState): string {
  const span = rangeInWords(state.rangeLengthDays);
  const pct = state.rangeLengthDays > 0 ? Math.round((state.daysInRange / state.rangeLengthDays) * 100) : 0;
  const base = (() => {
    switch (state.consistency) {
      case "never":
        return `Not appearing in your tracked data for ${span}.`;
      case "not-recent":
        return `Logged before, but not in ${span}.`;
      case "rare":
        return `Only appeared on ${state.daysInRange} of ${state.rangeLengthDays} day${state.rangeLengthDays === 1 ? "" : "s"} in ${span} — ${pct}%.`;
      case "occasional":
        return `Logged on ${state.daysInRange} of ${state.rangeLengthDays} days in ${span} — ${pct}%.`;
      default:
        return "";
    }
  })();
  // Lead with a few concrete members so the group name is never the only
  // thing telling the reader what it covers.
  const eg = NUTRITION_GROUP_EXAMPLES[state.group];
  return base ? `${eg}. ${base}` : eg;
}

const VEGETABLE_VARIETY_THRESHOLD = 4;
const FRUIT_VARIETY_THRESHOLD = 3;
const NUTS_SEEDS_VARIETY_THRESHOLD = 2;

function pillarVarietyCandidate(pillar: PillarId, threshold: number, states: GroupState[], foods: CanonicalEvent[], range: DateRange): PriorityCandidate | null {
  const subgroups = states.filter((s) => s.pillar === pillar);
  if (subgroups.length === 0) return null;

  // Frequency must already be reasonably met before "variety" is the right ask.
  const anyGoodFrequency = subgroups.some((s) => s.status === "good" || s.status === "strong");
  if (!anyGoodFrequency) return null;

  const pillarGroups = new Set(subgroups.map((s) => s.group));
  const pillarEvents = foods.filter((e) => e.date >= range.start && e.date <= range.end && groupsFor(e.item).some((g) => pillarGroups.has(g)));
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
    frequency: bulletFrequency(state),
  };
}

const emptyVariety: VarietyMetrics = {
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

/**
 * Main entry point: everything the Food page's decision-oriented sections
 * need, in one pass over the canonical events. Every metric here is scoped
 * to `range` (the page's own date-range selector) — nothing is computed
 * over a hardcoded trailing window, so switching the selected range to 30
 * days, 90 days, a year, or a custom span recalculates everything, not just
 * the charts underneath. The one deliberate exception is `totalLogsAllTime`
 * inside each `GroupState` (see `computeAggregateState`'s own comment).
 *
 * `overrides` (from useFoodNutritionGroupOverrides, keyed by normalized
 * item name) corrects a food's nutrition group before every group-based
 * metric below is computed from it — see nutritionGroupsForFood's own
 * comment for how an override interacts with the keyword lookup.
 */
export function computeNutritionPriorities(
  events: CanonicalEvent[],
  range: DateRange | null,
  overrides: Record<string, NutritionGroupId> = {},
): NutritionPriorities {
  currentOverrides = overrides;
  groupCache.clear();
  const span = getDatasetSpan(events);
  const foods = foodEvents(events);

  if (!span || !range || foods.length === 0) {
    return {
      insufficientData: true,
      daysWithFoodTracked: 0,
      topPriorities: [],
      underrepresentedGroups: [],
      doingWell: [],
      missing: [],
      coverageTable: [],
      groupStates: [],
      pillars: [],
      variety: emptyVariety,
      trend: { available: false, rangeLengthDays: 0, points: [] },
      rangeLabel: "",
    };
  }

  const rangeLengthDays = daysBetween(range.start, range.end) + 1;
  const foodsInRange = foods.filter((e) => e.date >= range.start && e.date <= range.end);
  const daysWithFoodTracked = new Set(foodsInRange.map((e) => e.date)).size;
  const insufficientData = daysWithFoodTracked < MIN_FOOD_DAYS_FOR_CONFIDENCE;

  const allGroupStates = PRIORITY_ELIGIBLE_GROUPS.map((g) => computeGroupState(g, foods, range, insufficientData));
  const otherSeafoodState = computeGroupState("other_seafood", foods, range, insufficientData);

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
        score: Math.max(0, 1 - s.rateInRangePerWeek / (s.targetPerWeek ?? 1)) * (evidence?.weight ?? 1),
        evidenceId: evidence?.evidenceId ?? null,
      };
    });

  // Special-case: eats fish generally, but fatty fish specifically lags —
  // replaces the generic fatty_fish bullet with a more precise one.
  const fattyFishIdx = groupCandidates.findIndex((c) => c.headline === NUTRITION_GROUP_LABEL.fatty_fish);
  if (fattyFishIdx >= 0 && otherSeafoodState.daysInRange >= 4) {
    groupCandidates[fattyFishIdx] = {
      ...groupCandidates[fattyFishIdx],
      detail: "You eat fish, but fatty fish specifically (salmon, mackerel, sardines) isn't regularly represented.",
    };
  }

  const varietyCandidates = [
    pillarVarietyCandidate("vegetables", VEGETABLE_VARIETY_THRESHOLD, allGroupStates, foods, range),
    pillarVarietyCandidate("fruit", FRUIT_VARIETY_THRESHOLD, allGroupStates, foods, range),
    pillarVarietyCandidate("nuts_seeds", NUTS_SEEDS_VARIETY_THRESHOLD, allGroupStates, foods, range),
  ].filter((c): c is PriorityCandidate => c !== null);

  const sortedGroupCandidates = [...groupCandidates].sort((a, b) => b.score - a.score);
  const topPriorities = insufficientData ? [] : [...groupCandidates, ...varietyCandidates].sort((a, b) => b.score - a.score).slice(0, 3);

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

      const fattyFishGap = gapOnes.find((s) => s.group === "fatty_fish");
      if (pillar === "fish" && fattyFishGap && otherSeafoodState.daysInRange >= 4) {
        missing.push({
          label: "Fatty fish",
          detail: "You eat fish, but fatty fish specifically isn't regularly represented.",
          action: ADD_PHRASE.fatty_fish ?? null,
          group: "fatty_fish",
          evidenceId: evidenceForGroup("fatty_fish")?.evidenceId ?? null,
          frequency: bulletFrequency(fattyFishGap),
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
            frequency: bulletFrequency(s),
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
  const vegState = computeAggregateState(CORE_VEGETABLE_GROUPS, 7, "Vegetables (overall)", "vegetables", foods, range, insufficientData);
  const fruitState = computeAggregateState(CORE_FRUIT_GROUPS, 7, "Fruit (overall)", "fruit", foods, range, insufficientData);
  const nutsSeedsState = computeAggregateState(["nuts", "seeds"], 5, "Nuts & seeds", "nuts_seeds", foods, range, insufficientData);

  const coverageTable: CoverageRow[] = [
    rowFor("Leafy greens", byGroup.get("leafy_greens")!),
    rowFor("Cruciferous", byGroup.get("cruciferous")!),
    rowFor("Red & orange veg", byGroup.get("red_orange_veg")!),
    rowFor("Onion family", byGroup.get("alliums")!),
    rowFor("Berries", byGroup.get("berries")!),
    rowFor("Citrus", byGroup.get("citrus")!),
    rowFor("Legumes", byGroup.get("legumes")!),
    rowFor("Whole grains", byGroup.get("whole_grains")!),
    rowFor("Nuts & seeds", nutsSeedsState),
    rowFor("Fatty fish", byGroup.get("fatty_fish")!),
    rowFor("Vegetables (overall)", vegState),
    rowFor("Fruit (overall)", fruitState),
  ];

  // ---- Pillar balance — keyed off the same union-based aggregate state as
  // the coverage table, so the Overview card never contradicts what the
  // coverage table says about the same pillar. ----
  const aggregateStateByPillar: Partial<Record<PillarId, GroupState>> = {
    vegetables: vegState,
    fruit: fruitState,
    legumes: byGroup.get("legumes"),
    grains: byGroup.get("whole_grains"),
    nuts_seeds: nutsSeedsState,
    fish: byGroup.get("fatty_fish"),
  };
  const pillars: PillarRow[] = CORE_PILLARS.map((pillar) =>
    pillarRow(pillar, aggregateStateByPillar[pillar]!, varietyCandidates, insufficientData),
  ).sort((a, b) => PILLAR_SEVERITY[a.status] - PILLAR_SEVERITY[b.status] || a.percentOfTarget - b.percentOfTarget);

  // ---- Variety metrics: distinct foods within the selected range ----
  const plantItems = new Set<string>();
  const plantGroupsSeen = new Set<NutritionGroupId>();
  const vegItems = new Set<string>();
  const fruitItems = new Set<string>();
  const legumeItems = new Set<string>();
  const nutSeedItems = new Set<string>();
  const families = new Set<string>();
  for (const e of foodsInRange) {
    const groups = groupsFor(e.item);
    for (const g of groups) {
      if (PLANT_GROUPS.includes(g)) {
        plantItems.add(e.item);
        plantGroupsSeen.add(g);
      }
      if (CORE_VEGETABLE_GROUPS.includes(g)) vegItems.add(e.item);
      if (CORE_FRUIT_GROUPS.includes(g)) fruitItems.add(e.item);
      if (g === "legumes") legumeItems.add(e.item);
      if (g === "nuts" || g === "seeds") nutSeedItems.add(e.item);
    }
    const family = plantFamilyForFood(e.item);
    if (family) families.add(family);
  }

  const variety: VarietyMetrics = {
    totalUniqueFoods: new Set(foodsInRange.map((e) => e.item)).size,
    uniquePlantFoods: plantItems.size,
    plantGroupsRepresented: plantGroupsSeen.size,
    totalPlantGroups: PLANT_GROUPS.length,
    uniqueVegetables: vegItems.size,
    uniqueFruit: fruitItems.size,
    uniqueLegumes: legumeItems.size,
    uniqueNutsSeeds: nutSeedItems.size,
    plantFamiliesRepresented: families.size,
  };

  // ---- Longitudinal trend: selected range vs. the equal-length period
  // immediately before it — same "prior period" definition already used by
  // Variety's ingredientDiversity, so this page never has two different
  // ideas of what "prior" means. Only available when the dataset actually
  // extends back far enough for that comparison, same guard. ----
  const prevEnd = addDaysToDate(range.start, -1);
  const prevStart = addDaysToDate(prevEnd, -(rangeLengthDays - 1));
  const trendAvailable = prevStart >= span.start;
  let trend: TrendSummary = { available: false, rangeLengthDays, points: [] };
  if (trendAvailable) {
    const currentFoods = foodsInRange;
    const previousFoods = foods.filter((e) => e.date >= prevStart && e.date <= prevEnd);

    const uniquePlants = (list: CanonicalEvent[]) => new Set(list.filter((e) => groupsFor(e.item).some((g) => PLANT_GROUPS.includes(g))).map((e) => e.item)).size;
    const uniqueVeg = (list: CanonicalEvent[]) =>
      new Set(list.filter((e) => groupsFor(e.item).some((g) => CORE_VEGETABLE_GROUPS.includes(g))).map((e) => e.item)).size;
    const exposureDays = (list: CanonicalEvent[], group: NutritionGroupId) => new Set(list.filter((e) => groupsFor(e.item).includes(group)).map((e) => e.date)).size;
    const coverageCount = (list: CanonicalEvent[]) => PRIORITY_ELIGIBLE_GROUPS.filter((g) => list.some((e) => groupsFor(e.item).includes(g))).length;

    trend = {
      available: true,
      rangeLengthDays,
      points: [
        { label: "Plant diversity (unique plant foods)", current: uniquePlants(currentFoods), previous: uniquePlants(previousFoods) },
        { label: "Vegetable diversity (unique vegetables)", current: uniqueVeg(currentFoods), previous: uniqueVeg(previousFoods) },
        { label: "Berry exposure (days)", current: exposureDays(currentFoods, "berries"), previous: exposureDays(previousFoods, "berries") },
        { label: "Legume exposure (days)", current: exposureDays(currentFoods, "legumes"), previous: exposureDays(previousFoods, "legumes") },
        { label: "Whole-grain exposure (days)", current: exposureDays(currentFoods, "whole_grains"), previous: exposureDays(previousFoods, "whole_grains") },
        { label: "Fatty-fish exposure (days)", current: exposureDays(currentFoods, "fatty_fish"), previous: exposureDays(previousFoods, "fatty_fish") },
        {
          label: "Nut/seed exposure (days)",
          current: exposureDays(currentFoods, "nuts") + exposureDays(currentFoods, "seeds"),
          previous: exposureDays(previousFoods, "nuts") + exposureDays(previousFoods, "seeds"),
        },
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
    pillars,
    variety,
    trend,
    rangeLabel: rangeInWords(rangeLengthDays).replace(/^the past /, ""),
  };
}

function rowFor(label: string, state: GroupState): CoverageRow {
  return {
    label,
    daysInRange: state.daysInRange,
    status: state.status,
    statusLabel: STATUS_LABEL[state.status],
  };
}

/**
 * Keyed off the same union-based aggregate state used for the coverage
 * table (single group for single-subgroup pillars) so the pillar card and
 * the coverage table never contradict each other for the same pillar.
 */
function dietBalanceRow(pillar: PillarId, aggregate: GroupState, varietyCandidates: PriorityCandidate[], insufficientData: boolean): DietBalanceRow {
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

/** `dietBalanceRow` plus the frequency numbers behind the verdict. */
function pillarRow(pillar: PillarId, aggregate: GroupState, varietyCandidates: PriorityCandidate[], insufficientData: boolean): PillarRow {
  const verdict = dietBalanceRow(pillar, aggregate, varietyCandidates, insufficientData);
  // Every core pillar has a real weekly target in practice (see this
  // interface's own doc comment) — the fallback only guards the type.
  const targetPerWeek = aggregate.targetPerWeek ?? 7;
  const percentOfTarget = Math.round((aggregate.rateInRangePerWeek / targetPerWeek) * 100);
  return {
    pillar,
    label: verdict.label,
    daysInRange: aggregate.daysInRange,
    rangeLengthDays: aggregate.rangeLengthDays,
    rateInRangePerWeek: aggregate.rateInRangePerWeek,
    targetPerWeek,
    percentOfTarget,
    status: verdict.status,
    statusLabel: verdict.statusLabel,
    notTracked: aggregate.daysInRange === 0,
  };
}
