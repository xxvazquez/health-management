import { describe, expect, it } from "vitest";
import {
  formatGymDate,
  formatGymDateShort,
  gymConsistencySummary,
  gymExerciseFrequency,
  gymInsight,
  gymStatsByExercise,
  gymTimeline,
  gymTrainedDates,
} from "./gym";
import type { RawGymLog } from "@/lib/types";

function makeGymLog(overrides: Partial<RawGymLog> = {}): RawGymLog {
  return {
    id: `gym-${Math.random()}`,
    date: "2026-01-01",
    exercise: "Squat",
    weightKg: 50,
    updatedAt: Date.parse("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("gymTrainedDates", () => {
  it("returns an empty set for no logs", () => {
    expect(gymTrainedDates([])).toEqual(new Set());
  });

  it("dedups multiple lifts on the same day to one trained date", () => {
    const logs = [makeGymLog({ date: "2026-01-01", exercise: "Squat" }), makeGymLog({ date: "2026-01-01", exercise: "Bench Press" })];
    expect(gymTrainedDates(logs)).toEqual(new Set(["2026-01-01"]));
  });
});

describe("gymConsistencySummary", () => {
  it("reports insufficientData for no logs", () => {
    const summary = gymConsistencySummary([], "2026-01-15");
    expect(summary.insufficientData).toBe(true);
    expect(summary.totalSessions).toBe(0);
  });

  it("reports insufficientData when training history spans fewer than 2 calendar months", () => {
    const logs = [makeGymLog({ date: "2026-01-01" }), makeGymLog({ date: "2026-01-15" })];
    expect(gymConsistencySummary(logs, "2026-01-20").insufficientData).toBe(true);
  });

  it("computes currentGapDays as the gap between the last session and asOfDate", () => {
    const logs = [makeGymLog({ date: "2026-01-01" }), makeGymLog({ date: "2026-02-01" })];
    const summary = gymConsistencySummary(logs, "2026-02-10");
    expect(summary.insufficientData).toBe(false);
    expect(summary.currentGapDays).toBe(9);
  });

  it("finds the longest gap between consecutive sessions", () => {
    const logs = [makeGymLog({ date: "2026-01-01" }), makeGymLog({ date: "2026-01-05" }), makeGymLog({ date: "2026-02-20" })];
    const summary = gymConsistencySummary(logs, "2026-02-21");
    expect(summary.longestGapStart).toBe("2026-01-05");
    expect(summary.longestGapEnd).toBe("2026-02-20");
    expect(summary.longestGapDays).toBe(46);
  });
});

describe("gymExerciseFrequency", () => {
  it("returns an empty array for no logs", () => {
    expect(gymExerciseFrequency([])).toEqual([]);
  });

  it("counts distinct trained dates per exercise, not raw log rows", () => {
    const logs = [
      makeGymLog({ date: "2026-01-01", exercise: "Squat", weightKg: 50 }),
      makeGymLog({ date: "2026-01-01", exercise: "Squat", weightKg: 55 }), // same day, second set — still 1 session
      makeGymLog({ date: "2026-01-03", exercise: "Squat" }),
    ];
    const freq = gymExerciseFrequency(logs);
    expect(freq[0]).toMatchObject({ exercise: "Squat", sessionCount: 2 });
  });

  it("sorts by session count descending", () => {
    const logs = [
      makeGymLog({ date: "2026-01-01", exercise: "Squat" }),
      makeGymLog({ date: "2026-01-01", exercise: "Bench Press" }),
      makeGymLog({ date: "2026-01-02", exercise: "Bench Press" }),
    ];
    expect(gymExerciseFrequency(logs).map((f) => f.exercise)).toEqual(["Bench Press", "Squat"]);
  });
});

describe("formatGymDate / formatGymDateShort", () => {
  it("formats with a year", () => {
    expect(formatGymDate("2026-08-17")).toContain("2026");
    expect(formatGymDate("2026-08-17")).toContain("17");
  });

  it("formats without a year", () => {
    expect(formatGymDateShort("2026-08-17")).not.toContain("2026");
    expect(formatGymDateShort("2026-08-17")).toContain("17");
  });
});

describe("gymStatsByExercise / gymInsight / gymTimeline (smoke)", () => {
  it("handle empty input without throwing", () => {
    expect(gymStatsByExercise([])).toEqual([]);
    expect(gymInsight([], "2026-01-01")).toMatchObject({ headline: "No workout sessions logged yet." });
    expect(gymTimeline([])).toEqual([]);
  });

  it("produce output for a real dataset without throwing", () => {
    const logs = [
      makeGymLog({ date: "2026-01-01", exercise: "Squat", weightKg: 50 }),
      makeGymLog({ date: "2026-01-08", exercise: "Squat", weightKg: 52.5 }),
      makeGymLog({ date: "2026-01-15", exercise: "Squat", weightKg: 55 }),
    ];
    expect(() => gymStatsByExercise(logs)).not.toThrow();
    expect(() => gymTimeline(logs)).not.toThrow();
    const timeline = gymTimeline(logs);
    expect(timeline.length).toBeGreaterThan(0);
  });
});
