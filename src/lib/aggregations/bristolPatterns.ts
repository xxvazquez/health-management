import type { CanonicalEvent, RawGymLog, RawStoolLog } from "@/lib/types";
import { bristolAssessedDates, bristolTypeDates } from "./digestion";
import {
  computeAssociationFromDateSets,
  crossDomainCauseCandidates,
  datesWhereValueMeets,
  MIN_INTERESTING_DIFF_PCT,
  SCAN_LAGS,
  type AssociationResult,
} from "./patterns";

const SLEEP_DURATION_ITEM = "Sleep duration";
const SLEEP_THRESHOLD_MINUTES = 7 * 60;
const MAX_BRISTOL_PATTERNS = 12;

/**
 * The initial comparison split — Bristol 3–4 vs. everything else logged.
 * A parameter to the comparison call, not a stored category: individual
 * Bristol types are read fresh from `stoolLogs` on every call via
 * `bristolTypeDates`, so a later comparison distinguishing e.g. Bristol
 * 1–2 from Bristol 5–7 is just a different type list here, never a
 * data-model change. Neutral label on purpose — never "normal"/"better"/
 * "worse"/"good"/"bad".
 */
const BRISTOL_COMPARISON_TYPES = [3, 4];
export const BRISTOL_COMPARISON_LABEL = "Bristol 3–4";

/**
 * Single-cause, single-outcome cross-domain scan against Bristol: for every
 * candidate (foods, supplements, every tracked habit, a gym-trained day,
 * sleep duration ≥7h when that's being logged), how often was the
 * same/lagged-day Bristol reading in the 3–4 range vs. not, among days any
 * Bristol reading was logged. Mirrors `generateTopPatterns`'s structure and
 * candidate pool exactly (same sample gate, lag scan, non-causal
 * phrasing) — this is that same engine pointed at Bristol specifically,
 * not a separate implementation. Deliberately no combinations: every
 * result here is one cause vs. one outcome. Bristol data comes from
 * `stoolLogs` (its own table), everything else from `events` — the two
 * datasets are joined here only by shared calendar dates.
 */
export function generateBristolPatterns(events: CanonicalEvent[], stoolLogs: RawStoolLog[], gymLogs: RawGymLog[] = []): AssociationResult[] {
  const trackedSet = bristolAssessedDates(stoolLogs);
  if (trackedSet.size === 0) return [];

  const outcomeDates = bristolTypeDates(stoolLogs, BRISTOL_COMPARISON_TYPES);

  const hasSleepDuration = events.some((e) => e.item === SLEEP_DURATION_ITEM);
  const causeCandidates = [
    ...crossDomainCauseCandidates(events, gymLogs),
    ...(hasSleepDuration
      ? [
          {
            label: `${SLEEP_DURATION_ITEM} ≥7h`,
            dates: datesWhereValueMeets(events, SLEEP_DURATION_ITEM, (v) => v >= SLEEP_THRESHOLD_MINUTES),
          },
        ]
      : []),
  ];

  const results: AssociationResult[] = [];
  for (const cause of causeCandidates) {
    let best: AssociationResult | null = null;
    for (const lag of SCAN_LAGS) {
      const assoc = computeAssociationFromDateSets(cause.dates, outcomeDates, trackedSet, lag, cause.label, BRISTOL_COMPARISON_LABEL);
      if (assoc.sampleTier === "insufficient") continue;
      if (!best || Math.abs(assoc.diffPct) > Math.abs(best.diffPct)) best = assoc;
    }
    if (best && Math.abs(best.diffPct) >= MIN_INTERESTING_DIFF_PCT) {
      results.push(best);
    }
  }

  return results.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct)).slice(0, MAX_BRISTOL_PATTERNS);
}
