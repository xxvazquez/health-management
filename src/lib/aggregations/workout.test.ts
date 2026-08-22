import { describe, expect, it } from "vitest";
import {
  formatWorkoutDate,
  formatWorkoutDateShort,
  workoutConsistencySummary,
  workoutExerciseFrequency,
  workoutInsight,
  workoutStatsByExercise,
  workoutTimeline,
  workoutTrainedDates,
} from "./workout";
import type { RawWorkoutLog } from "@/lib/types";

function makeWorkoutLog(overrides: Partial<RawWorkoutLog> = {}): RawWorkoutLog {
  return {
    id: `workout-${Math.random()}`,
    date: "2026-01-01",
    exercise: "Squat",
    weightKg: 50,
    updatedAt: Date.parse("2026-01-01T12:00:00Z"),
    ...overrides,
  };
}

describe("workoutTrainedDates", () => {
  it("returns an empty set for no logs", () => {
    expect(workoutTrainedDates([])).toEqual(new Set());
  });

  it("dedups multiple lifts on the same day to one trained date", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01", exercise: "Squat" }), makeWorkoutLog({ date: "2026-01-01", exercise: "Bench Press" })];
    expect(workoutTrainedDates(logs)).toEqual(new Set(["2026-01-01"]));
  });
});

describe("workoutConsistencySummary", () => {
  it("reports insufficientData for no logs", () => {
    const summary = workoutConsistencySummary([], "2026-01-15");
    expect(summary.insufficientData).toBe(true);
    expect(summary.totalSessions).toBe(0);
  });

  it("reports insufficientData when training history spans fewer than 2 calendar months", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01" }), makeWorkoutLog({ date: "2026-01-15" })];
    expect(workoutConsistencySummary(logs, "2026-01-20").insufficientData).toBe(true);
  });

  it("computes currentGapDays as the gap between the last session and asOfDate", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01" }), makeWorkoutLog({ date: "2026-02-01" })];
    const summary = workoutConsistencySummary(logs, "2026-02-10");
    expect(summary.insufficientData).toBe(false);
    expect(summary.currentGapDays).toBe(9);
  });

  it("finds the longest gap between consecutive sessions", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01" }), makeWorkoutLog({ date: "2026-01-05" }), makeWorkoutLog({ date: "2026-02-20" })];
    const summary = workoutConsistencySummary(logs, "2026-02-21");
    expect(summary.longestGapStart).toBe("2026-01-05");
    expect(summary.longestGapEnd).toBe("2026-02-20");
    expect(summary.longestGapDays).toBe(46);
  });
});

describe("workoutExerciseFrequency", () => {
  it("returns an empty array for no logs", () => {
    expect(workoutExerciseFrequency([])).toEqual([]);
  });

  it("counts distinct trained dates per exercise, not raw log rows", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-01", exercise: "Squat", weightKg: 50 }),
      makeWorkoutLog({ date: "2026-01-01", exercise: "Squat", weightKg: 55 }), // same day, second set — still 1 session
      makeWorkoutLog({ date: "2026-01-03", exercise: "Squat" }),
    ];
    const freq = workoutExerciseFrequency(logs);
    expect(freq[0]).toMatchObject({ exercise: "Squat", sessionCount: 2 });
  });

  it("sorts by session count descending", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-01", exercise: "Squat" }),
      makeWorkoutLog({ date: "2026-01-01", exercise: "Bench Press" }),
      makeWorkoutLog({ date: "2026-01-02", exercise: "Bench Press" }),
    ];
    expect(workoutExerciseFrequency(logs).map((f) => f.exercise)).toEqual(["Bench Press", "Squat"]);
  });
});

describe("formatWorkoutDate / formatWorkoutDateShort", () => {
  it("formats with a year", () => {
    expect(formatWorkoutDate("2026-08-17")).toContain("2026");
    expect(formatWorkoutDate("2026-08-17")).toContain("17");
  });

  it("formats without a year", () => {
    expect(formatWorkoutDateShort("2026-08-17")).not.toContain("2026");
    expect(formatWorkoutDateShort("2026-08-17")).toContain("17");
  });
});

describe("workoutStatsByExercise / workoutInsight / workoutTimeline (smoke)", () => {
  it("handle empty input without throwing", () => {
    expect(workoutStatsByExercise([])).toEqual([]);
    expect(workoutInsight([], "2026-01-01")).toMatchObject({ headline: "No workout sessions logged yet." });
    expect(workoutTimeline([])).toEqual([]);
  });

  it("produce output for a real dataset without throwing", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-01", exercise: "Squat", weightKg: 50 }),
      makeWorkoutLog({ date: "2026-01-08", exercise: "Squat", weightKg: 52.5 }),
      makeWorkoutLog({ date: "2026-01-15", exercise: "Squat", weightKg: 55 }),
    ];
    expect(() => workoutStatsByExercise(logs)).not.toThrow();
    expect(() => workoutTimeline(logs)).not.toThrow();
    const timeline = workoutTimeline(logs);
    expect(timeline.length).toBeGreaterThan(0);
  });
});
