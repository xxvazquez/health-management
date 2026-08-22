import type { CanonicalEvent, RawWorkoutLog, RawStoolLog } from "@/lib/types";
import { addDaysToDate, getDatasetSpan, trackedCalendarDates } from "./common";
import { supplementsInsight } from "./supplements";
import { habitsInsight } from "./habits";
import { digestionInsight } from "./digestion";
import { computeNutritionPriorities } from "./nutritionPriorities";
import { generateTopPatterns, type AssociationResult } from "./patterns";
import { generateBristolPatterns } from "./bristolPatterns";
import type { Bullet, InsightTone } from "./insights";

export interface OverviewInsight {
  insufficientData: boolean;
  headline: string;
  detail: string | null;
  tone: InsightTone;
  /** Evidence-grounded coverage that's genuinely well represented — sourced
   * only from Food's dietary-guidance engine, the one domain in this app
   * with an actual external basis for "this matters". */
  whatMatters: Bullet[];
  /** Evidence-grounded gaps — same source, same reasoning, the other
   * direction. Never populated from habit/supplement drift: neither has an
   * explicit user-defined target, so neither has a basis to be "attention
   * worthy" rather than merely "different from usual". */
  needsAttention: Bullet[];
  /** Purely personal longitudinal — what moved vs. this person's own
   * history, across every domain, with no claim about whether the move is
   * good or bad. */
  whatChanged: Bullet[];
}

const MIN_TRACKED_DAYS_FOR_INSIGHT = 10;
const CHANGE_DAY_THRESHOLD = 2;
const CHANGE_COUNT_THRESHOLD = 2;

/**
 * "How am I doing overall" — the primary Overview insight. Two separate
 * questions, kept structurally separate rather than blended into one
 * ranking:
 *
 *  - "What matters / needs attention" comes ONLY from Food's
 *    evidence-informed engine (established dietary guidance + personal
 *    intake + sample-size gating) — the only domain here with a
 *    defensible external basis for calling something good or a gap.
 *  - "What changed" comes from every domain's own recent-vs-usual
 *    comparison, but is never used to rank domains against each other or
 *    to decide what's "attention worthy" — a big swing in something
 *    unimportant must never outrank a smaller but meaningful food-group
 *    gap, so drift never feeds the headline or the tone.
 */
export function computeOverviewInsight(events: CanonicalEvent[], stoolLogs: RawStoolLog[]): OverviewInsight {
  const span = getDatasetSpan(events);
  const trackedDates = trackedCalendarDates(events);

  if (!span || trackedDates.size < MIN_TRACKED_DAYS_FOR_INSIGHT) {
    return {
      insufficientData: true,
      headline: "Not enough data yet to summarize your patterns.",
      detail: "Keep logging — this section fills in once there's enough history to compare against.",
      tone: "neutral",
      whatMatters: [],
      needsAttention: [],
      whatChanged: [],
    };
  }

  const habits = habitsInsight(events);
  const supplements = supplementsInsight(events);
  const food = computeNutritionPriorities(events);
  const digestion = digestionInsight(events, stoolLogs);

  // --- What matters / needs attention: Food only, evidence-grounded ---
  const whatMatters: Bullet[] = food.insufficientData ? [] : food.doingWell.slice(0, 3);
  const needsAttention: Bullet[] = food.insufficientData
    ? []
    : food.topPriorities.slice(0, 3).map((p) => ({ label: p.headline, detail: p.detail }));

  let headline: string;
  if (food.insufficientData) {
    headline = "Not enough food data logged yet to say what matters most.";
  } else if (needsAttention.length > 0) {
    headline = `${needsAttention[0].label} could use more attention.`;
  } else if (whatMatters.length > 0) {
    headline = "Your tracked food groups are looking well covered.";
  } else {
    headline = "There's not a clear standout in your food data yet.";
  }

  const tone: InsightTone =
    !food.insufficientData && needsAttention.length > 0
      ? "attention"
      : !food.insufficientData && whatMatters.length > 0
        ? "good"
        : "neutral";

  // --- What changed: every domain's own recent-vs-usual, neutral, capped ---
  const whatChanged: Bullet[] = [];
  const sortedTracked = Array.from(trackedDates).sort();
  const last7 = sortedTracked.filter((d) => d >= addDaysToDate(span.end, -6)).length;
  const prior7 = sortedTracked.filter((d) => d >= addDaysToDate(span.end, -13) && d < addDaysToDate(span.end, -6)).length;
  if (Math.abs(last7 - prior7) >= CHANGE_DAY_THRESHOLD) {
    whatChanged.push({
      label: "Tracking",
      detail: `Logged on ${last7} of the last 7 days, vs. ${prior7} the week before.`,
      compact: `${last7}/7 days recently · ${prior7}/7 before`,
    });
  }
  if (!habits.insufficientData) {
    for (const b of habits.changed.slice(0, 2)) whatChanged.push({ label: b.label, detail: b.detail, compact: b.compact });
  }
  if (!supplements.insufficientData) {
    for (const b of supplements.changed.slice(0, 2)) whatChanged.push({ label: b.label, detail: b.detail, compact: b.compact });
  }
  const plantTrend = food.trend.available ? food.trend.points.find((p) => p.label.startsWith("Plant diversity")) : null;
  if (plantTrend && Math.abs(plantTrend.current - plantTrend.previous) >= CHANGE_COUNT_THRESHOLD) {
    whatChanged.push({
      label: "Food variety",
      detail: `Unique plant foods over 30 days: ${plantTrend.previous} → ${plantTrend.current}.`,
      compact: `${plantTrend.previous} → ${plantTrend.current} unique plants`,
    });
  }
  if (!digestion.insufficientData) {
    for (const b of digestion.changed.slice(0, 1)) whatChanged.push({ label: b.label, detail: b.detail, compact: b.compact });
  }

  return {
    insufficientData: false,
    headline,
    detail: null,
    tone,
    whatMatters,
    needsAttention,
    whatChanged: whatChanged.slice(0, 6),
  };
}

const MAX_OVERVIEW_FINDINGS = 4;

/**
 * The strongest cross-domain findings across the whole app — Bristol
 * comparisons plus the general food/supplement/habit/workout-vs-symptom scan —
 * ranked by magnitude and deduped by cause+outcome pair, for a short
 * "what stands out" list on Overview. Reuses `generateBristolPatterns` and
 * `generateTopPatterns` directly rather than re-scanning anything; this is
 * a ranked slice of their combined output, not a separate analysis.
 */
export function topCrossDomainFindings(events: CanonicalEvent[], stoolLogs: RawStoolLog[], workoutLogs: RawWorkoutLog[] = []): AssociationResult[] {
  const combined = [...generateBristolPatterns(events, stoolLogs, workoutLogs), ...generateTopPatterns(events, workoutLogs)].sort(
    (a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct),
  );

  const seen = new Set<string>();
  const deduped: AssociationResult[] = [];
  for (const r of combined) {
    const key = `${r.causeLabel}|${r.outcomeLabel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
    if (deduped.length >= MAX_OVERVIEW_FINDINGS) break;
  }
  return deduped;
}
