import type { ItemTrend } from "./itemStats";

/** Shared vocabulary for every page-level synthesized insight. `tone`
 * drives which status color (if any) the Insight component uses for its
 * label — and must only ever be set from an evidence- or target-backed
 * judgment (e.g. Food's dietary-guidance engine), never from personal
 * baseline drift alone. Drift tells Lauva what changed; it never by
 * itself tells Lauva what matters. */
export type InsightTone = "good" | "neutral" | "attention" | "serious";

export interface Bullet {
  label: string;
  detail: string;
}

const MIN_BASELINE_TRACKED_DAYS = 10;
const MIN_RECENT_TRACKED_DAYS = 5;
const DRIFT_THRESHOLD_PP = 15;

export type ChangeDirection = "increased" | "decreased" | "stable" | "insufficient-data";

export function driftFor(trend: ItemTrend): ChangeDirection {
  if (trend.overallTrackedDays < MIN_BASELINE_TRACKED_DAYS || trend.recentTrackedDays < MIN_RECENT_TRACKED_DAYS) {
    return "insufficient-data";
  }
  const diff = (trend.recentConsistencyPct ?? 0) - trend.overallConsistencyPct;
  if (diff <= -DRIFT_THRESHOLD_PP) return "decreased";
  if (diff >= DRIFT_THRESHOLD_PP) return "increased";
  return "stable";
}

export interface PersonalChangeSummary {
  insufficientData: boolean;
  headline: string;
  detail: string | null;
  /** Items running above/below their own usual pace — magnitude-sorted,
   * both directions mixed together on purpose: this list is not a
   * good/bad ranking, just "what moved". */
  changed: Bullet[];
}

/**
 * Shared "what changed relative to my own history" summary for Habits and
 * Supplements — structurally identical questions, and deliberately the
 * ONLY thing these two domains produce. Neither habits nor supplements
 * have an explicit user-defined target in this app's data model, so
 * there's no defensible basis to call a change "good" or "needs
 * attention" — only to describe it. (Food is different: it has an actual
 * evidence-informed target per food group, which is why Food gets to make
 * that call and these two don't.)
 */
export function buildPersonalChangeSummary(trends: ItemTrend[], nounSingular: string, nounPlural: string): PersonalChangeSummary {
  const judgeable = trends.filter((t) => driftFor(t) !== "insufficient-data");

  if (judgeable.length === 0) {
    return {
      insufficientData: true,
      headline: "Not enough recent data to identify a clear pattern.",
      detail: trends.length > 0 ? `Keep logging — ${trends.length} tracked ${trends.length === 1 ? nounSingular : nounPlural} so far.` : null,
      changed: [],
    };
  }

  const withDrift = judgeable.map((t) => ({
    trend: t,
    direction: driftFor(t),
    magnitude: Math.abs((t.recentConsistencyPct ?? 0) - t.overallConsistencyPct),
  }));
  const moved = withDrift.filter((t) => t.direction !== "stable").sort((a, b) => b.magnitude - a.magnitude);

  const headline =
    moved.length === 0
      ? `All ${judgeable.length} tracked ${judgeable.length === 1 ? nounSingular : nounPlural} ${judgeable.length === 1 ? "is" : "are"} running at their usual pace.`
      : `${moved.length} of ${judgeable.length} tracked ${judgeable.length === 1 ? nounSingular : nounPlural} ${moved.length === 1 ? "is" : "are"} running differently than usual this week.`;

  const changed: Bullet[] = moved.slice(0, 4).map((m) => ({
    label: m.trend.item,
    detail: m.direction === "increased" ? "Above its usual level recently." : "Below its usual level recently.",
  }));

  return {
    insufficientData: false,
    headline,
    detail:
      trends.length > judgeable.length
        ? `${trends.length - judgeable.length} more tracked ${trends.length - judgeable.length === 1 ? nounSingular : nounPlural} without enough history yet to judge.`
        : null,
    changed,
  };
}
