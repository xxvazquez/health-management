import { describe, expect, it } from "vitest";
import { groupIntoPeriodRuns, cycleLengthsFromRuns, currentCycleStatus, predictUpcomingPeriods, cycleAnalysis } from "./cycle";
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

  it("splits into a separate run as soon as a single day is skipped", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-03")];
    const runs = groupIntoPeriodRuns(logs);
    expect(runs).toHaveLength(2);
  });

  it("splits into separate runs when the gap is more than a day", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-05")];
    const runs = groupIntoPeriodRuns(logs);
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
    expect(predictUpcomingPeriods([])).toEqual([]);
  });

  it("returns nothing with only one period (no cycle length yet)", () => {
    expect(predictUpcomingPeriods(groupIntoPeriodRuns([makeLog("2026-01-01")]))).toEqual([]);
  });

  it("projects the next periods using the median recent cycle length", () => {
    // Three 28-day cycles in a row.
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-29"), makeLog("2026-02-26")];
    const predictions = predictUpcomingPeriods(groupIntoPeriodRuns(logs), 2);
    expect(predictions).toHaveLength(2);
    expect(predictions[0].expectedStart).toBe("2026-03-26");
    expect(predictions[1].expectedStart).toBe("2026-04-23");
  });

  it("widens the earliest/latest band with real cycle-length variation", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-25"), makeLog("2026-02-25")]; // 24, then 31 days
    const predictions = predictUpcomingPeriods(groupIntoPeriodRuns(logs), 1);
    expect(predictions[0].earliestStart).not.toBe(predictions[0].latestStart);
  });
});

describe("cycleAnalysis", () => {
  it("reports zero/null for no recorded periods", () => {
    const analysis = cycleAnalysis([]);
    expect(analysis.averageCycleLength).toBeNull();
    expect(analysis.lastCycleLength).toBeNull();
    expect(analysis.cyclesAnalyzed).toBe(0);
  });

  it("computes average and last cycle length across completed cycles", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-29"), makeLog("2026-02-28")]; // 28, then 30
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs));
    expect(analysis.lastCycleLength).toBe(30);
    expect(analysis.averageCycleLength).toBe(29);
    expect(analysis.cyclesAnalyzed).toBe(2);
  });

  it("computes average period length from run lengths", () => {
    const logs = [makeLog("2026-01-01"), makeLog("2026-01-02"), makeLog("2026-01-03"), makeLog("2026-01-29"), makeLog("2026-01-30")];
    const analysis = cycleAnalysis(groupIntoPeriodRuns(logs));
    expect(analysis.averagePeriodLength).toBe(2.5);
  });
});
