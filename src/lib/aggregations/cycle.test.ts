import { describe, expect, it } from "vitest";
import { checkInsByPhase, isGapCycle, groupIntoPeriodRuns, cycleLengthsFromRuns, cyclePhaseByDate, currentCycleStatus, predictUpcomingPeriods, cycleAnalysis, cycleHistory, cycleChartEntries } from "./cycle";
import type { RawPeriodLog } from "@/lib/types";

function makeLog(date: string, overrides: Partial<RawPeriodLog> = {}): RawPeriodLog {
  return {
    id: `period-${date}-${Math.random()}`,
    date,
    intensity: "Medium",
    collectionMethods: [],
    updatedAt: Date.parse(`${date}T09:00:00Z`),
    ...overrides,
  };
}

describe("groupIntoPeriodRuns", () => {
  it("returns no runs for no logs", () => {
    expect(groupIntoPeriodRuns([])).toEqual([]);
  });

  it("groups consecutive dates into one run", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03")];
    const runs = groupIntoPeriodRuns(logs);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ startDate: "2026-01-01", endDate: "2026-01-03" });
    expect(runs[0].days).toHaveLength(3);
  });

  it("bridges a single unlogged day inside a period", () => {
    const runs = groupIntoPeriodRuns([makeLog("2026-01-01"), makeLog("2026-01-03")]);
    expect(runs).toHaveLength(1);
    expect(runs[0].endDate).toBe("2026-01-03");
  });

  it("splits into a separate run after two unlogged days", () => {
    const runs = groupIntoPeriodRuns([makeLog("2026-01-01"), makeLog("2026-01-04")]);
    expect(runs).toHaveLength(2);
  });

  it("sorts out-of-order input by date before grouping", () => {
    const logs = [makeLog("2026-02-01"), makeLog("2026-01-01"), makeLog("2026-01-02")];
    const runs = groupIntoPeriodRuns(logs);
    expect(runs).toHaveLength(2);
    expect(runs[0].startDate).toBe("2026-01-01");
  });
});

describe("cycleLengthsFromRuns", () => {
  it("returns nothing for fewer than two runs", () => {
    expect(cycleLengthsFromRuns(groupIntoPeriodRuns([makeLog("2026-01-01")]))).toEqual([]);
  });

  it("computes days between consecutive run starts", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-29")];
    expect(cycleLengthsFromRuns(groupIntoPeriodRuns(logs))).toEqual([28]);
  });
});

describe("cycleHistory / cycleChartEntries", () => {
  it("lists cycles newest first, the current one running to today", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-29"), makeLog("2026-02-26")];
    const history = cycleHistory(groupIntoPeriodRuns(logs), "2026-03-05");
    expect(history.map((c) => [c.start, c.end, c.length, c.periodDays, c.current])).toEqual([
      ["2026-02-26", "2026-03-05", 8, 1, true],
      ["2026-01-29", "2026-02-25", 28, 1, false],
      ["2026-01-01", "2026-01-28", 28, 2, false],
    ]);
  });

  it("keeps the chart to completed, non-gap cycles from 2022 on, oldest first", () => {
    const logs = [makeLog("2021-12-01"), makeLog("2021-12-29"), makeLog("2026-01-01"), makeLog("2026-01-29"), makeLog("2026-02-26")];
    const history = cycleHistory(groupIntoPeriodRuns(logs), "2026-03-05");
    expect(history.find((c) => c.start === "2021-12-29")?.gap).toBe(true);
    expect(cycleChartEntries(history).map((c) => c.start)).toEqual(["2026-01-01", "2026-01-29"]);
  });
});

describe("currentCycleStatus", () => {
  const runs = groupIntoPeriodRuns([makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03"), makeLog("2026-01-29")]);

  it("reports onPeriod with the period day for a date inside a run", () => {
    const status = currentCycleStatus(runs, "2026-01-02");
    expect(status.onPeriod).toBe(true);
    expect(status.periodDay).toBe(2);
    expect(status.cycleDay).toBe(2);
  });

  it("reports the cycle day (not on period) for a date between periods", () => {
    const status = currentCycleStatus(runs, "2026-01-10");
    expect(status.onPeriod).toBe(false);
    expect(status.periodDay).toBeNull();
    expect(status.cycleDay).toBe(10);
  });

  it("resets cycle day counting from the most recent period start", () => {
    const status = currentCycleStatus(runs, "2026-01-30");
    expect(status.cycleDay).toBe(2);
  });

  it("returns nulls for a date before any recorded period", () => {
    const status = currentCycleStatus(runs, "2025-12-01");
    expect(status.cycleDay).toBeNull();
    expect(status.onPeriod).toBe(false);
  });
});

describe("predictUpcomingPeriods", () => {
  it("returns nothing with no recorded periods", () => {
    expect(predictUpcomingPeriods([], 3, "2026-01-01")).toEqual([]);
  });

  it("returns nothing with only one period (no cycle length yet)", () => {
    expect(predictUpcomingPeriods(groupIntoPeriodRuns([makeLog("2026-01-01")]), 3, "2026-01-05")).toEqual([]);
  });

  it("projects the next periods using the median recent cycle length", () => {
    // Three 28-day cycles in a row.
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-29"), makeLog("2026-02-26")];
    const predictions = predictUpcomingPeriods(groupIntoPeriodRuns(logs), 2, "2026-02-27");
    expect(predictions).toHaveLength(2);
    expect(predictions[0].expectedStart).toBe("2026-03-26");
    expect(predictions[1].expectedStart).toBe("2026-04-23");
  });

  it("widens the earliest/latest band with real cycle-length variation", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-25"), makeLog("2026-02-25")]; // 24, then 31 days
    const predictions = predictUpcomingPeriods(groupIntoPeriodRuns(logs), 1, "2026-02-26");
    expect(predictions[0].earliestStart).not.toBe(predictions[0].latestStart);
  });

  // Regression: the expected period LENGTH (not cycle length — the gap
  // between starts) used to always include the most recent run's length
  // even when that run was still being actively logged (today falls
  // inside it), understating the typical/predicted length on literally the
  // first day of every new period for anyone with 1-2 prior cycles.
  it("excludes the last period's length from the typical-length calculation while it's still being logged", () => {
    // A completed 5-day period, then a new one that's only 1 day in so far.
    const logs = [
      makeLog("2026-01-01"),
      makeLog("2026-01-02"),
      makeLog("2026-01-03"),
      makeLog("2026-01-04"),
      makeLog("2026-01-05"),
      makeLog("2026-01-29"), // day 1 of the next period — still being logged as of "today"
    ];
    const runs = groupIntoPeriodRuns(logs);
    const predictions = predictUpcomingPeriods(runs, 1, "2026-01-29"); // today = the in-progress run's only day so far
    // Without the fix this would be round(median([5, 1])) = 3; with the
    // in-progress run excluded, only the completed 5-day period counts.
    expect(predictions[0].expectedLength).toBe(5);
  });

  it("includes the last period's length once it's no longer in progress (today is well past its last logged day)", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03"), makeLog("2026-01-04"), makeLog("2026-01-05"), makeLog("2026-01-29")];
    const runs = groupIntoPeriodRuns(logs);
    const predictions = predictUpcomingPeriods(runs, 1, "2026-02-10"); // today is well after 2026-01-29
    // median([5, 1]) = 3 once the second run counts as complete.
    expect(predictions[0].expectedLength).toBe(3);
  });
});

describe("isGapCycle", () => {
  it("flags very short cycles and ones about twice the usual length", () => {
    expect(isGapCycle(12, [12])).toBe(true);
    expect(isGapCycle(56, [28, 29, 56, 28])).toBe(true);
    expect(isGapCycle(35, [28, 29, 35, 28])).toBe(false);
    expect(isGapCycle(56, [28, 56])).toBe(false);
  });
});

describe("cycleAnalysis", () => {
  it("reports zero/null for no recorded periods", () => {
    const analysis = cycleAnalysis([], "2026-01-01");
    expect(analysis.averageCycleLength).toBeNull();
    expect(analysis.lastCycleLength).toBeNull();
    expect(analysis.cyclesAnalyzed).toBe(0);
  });

  it("computes average and last cycle length across completed cycles", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-29"), makeLog("2026-02-28")]; // 28, then 30
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs), "2026-03-01");
    expect(analysis.lastCycleLength).toBe(30);
    expect(analysis.averageCycleLength).toBe(29);
    expect(analysis.cyclesAnalyzed).toBe(2);
  });

  it("leaves a missed-period-sized cycle out of the average and variation", () => {
    // 28, 29, 56 (a period never logged), 28.
    const logs = ["2026-01-01", "2026-01-29", "2026-02-27", "2026-04-24", "2026-05-22"].map((d) => makeLog(d));
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs), "2026-06-01");
    expect(analysis.lastCycleLength).toBe(28);
    expect(analysis.averageCycleLength).toBe(28.3);
    expect(analysis.cyclesAnalyzed).toBe(3);
    // The typical length is the one the prediction is built on.
    expect(analysis.typicalCycleLength).toBe(28);
    expect(predictUpcomingPeriods(groupIntoPeriodRuns(logs), 1, "2026-06-01")[0].expectedStart).toBe("2026-06-19");
    expect(predictUpcomingPeriods(groupIntoPeriodRuns(logs), 1, "2026-06-01")[0].latestStart).toBe("2026-06-20");
    expect(cycleChartEntries(cycleHistory(groupIntoPeriodRuns(logs), "2026-06-01")).map((c) => c.length)).toEqual([28, 29, 28]);
  });

  it("computes average period length from run lengths, once they're all complete", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03"), makeLog("2026-01-29"), makeLog("2026-01-30")];
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs), "2026-02-15"); // well after the last logged day
    expect(analysis.averagePeriodLength).toBe(2.5);
  });

  // Regression — see the matching predictUpcomingPeriods test above.
  it("excludes the last period's length while it's still being logged (today falls inside it)", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03"), makeLog("2026-01-29"), makeLog("2026-01-30")];
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs), "2026-01-30"); // today = the last run's own last logged day
    expect(analysis.averagePeriodLength).toBe(3); // only the first (completed) 3-day run counts
    expect(analysis.periodsAnalyzed).toBe(1);
  });
});

describe("cyclePhaseByDate", () => {
  it("labels each day of a completed cycle and leaves the current one out", () => {
    const logs = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-29", "2026-03-30"].map((d) => makeLog(d));
    const phases = cyclePhaseByDate(groupIntoPeriodRuns(logs));
    expect(phases.get("2026-03-02")).toBe("Menstrual");
    expect(phases.get("2026-03-08")).toBe("Follicular");
    expect(phases.get("2026-03-15")).toBe("Ovulation");
    expect(phases.get("2026-03-20")).toBe("Luteal");
    expect(phases.has("2026-03-29")).toBe(false);
  });

  it("skips a gap-sized cycle", () => {
    const logs = ["2026-01-01", "2026-03-01"].map((d) => makeLog(d));
    expect(cyclePhaseByDate(groupIntoPeriodRuns(logs)).size).toBe(0);
  });
});

describe("checkInsByPhase", () => {
  it("averages each phase and holds back a phase with too few ratings", () => {
    const runs = groupIntoPeriodRuns(["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-29"].map((d) => makeLog(d)));
    const checkIns = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-20"].map((date, i) => ({ date, mood: i < 3 ? 2 : 5, energy: null, note: "" }));
    const [menstrual, , , luteal] = checkInsByPhase(runs, checkIns);
    expect(menstrual).toMatchObject({ phase: "Menstrual", days: 3, mood: 2, energy: null });
    expect(luteal).toMatchObject({ phase: "Luteal", days: 1, mood: null });
  });
});
