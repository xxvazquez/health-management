import { describe, expect, it } from "vitest";
import {
  describeProgression,
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

  // Regression: exercises are fully user-editable (rename/add via Manage —
  // see categoryResolution.ts), but this used to iterate the fixed 7-name
  // WORKOUT_EXERCISES list rather than reading exercises from the logs
  // themselves, so a renamed or custom exercise silently never appeared
  // here (or in workoutStatsByExercise/workoutTimeline, which share the
  // same underlying logic).
  it("includes an exercise that isn't one of the 7 built-in defaults", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01", exercise: "Farmer's Walk" })];
    expect(workoutExerciseFrequency(logs).map((f) => f.exercise)).toContain("Farmer's Walk");
    expect(workoutStatsByExercise(logs).map((s) => s.exercise)).toContain("Farmer's Walk");
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
});

// Regression: same-day entries used to fall through to an arbitrary tie
// (stable-sorted by whatever order they arrived in, i.e. IndexedDB's own
// getAll() key order — not creation time) in workoutStatsByExercise, and to
// alphabetical-by-exercise-name in workoutTimeline. Both are fixed to break
// same-date ties by the full-precision `updatedAt` timestamp instead.
describe("same-day ordering is by actual timestamp, not array/name order", () => {
  it("workoutStatsByExercise orders same-day sets by updatedAt even when the input array arrives out of order", () => {
    const logs = [
      makeWorkoutLog({ id: "third", date: "2026-01-01", exercise: "Squat", weightKg: 70, updatedAt: Date.parse("2026-01-01T18:45:00Z") }),
      makeWorkoutLog({ id: "first", date: "2026-01-01", exercise: "Squat", weightKg: 60, updatedAt: Date.parse("2026-01-01T18:00:00Z") }),
      makeWorkoutLog({ id: "second", date: "2026-01-01", exercise: "Squat", weightKg: 65, updatedAt: Date.parse("2026-01-01T18:15:00Z") }),
    ];
    const [stats] = workoutStatsByExercise(logs);
    expect(stats.entries.map((e) => e.id)).toEqual(["first", "second", "third"]);
    // "current" is meant to be the most recently logged set of the day —
    // wrong without the fix, since entries[entries.length - 1] would have
    // been whatever the input's last array element happened to be.
    expect(stats.current.weightKg).toBe(70);
  });

  it("workoutTimeline orders same-day entries across exercises by updatedAt (most recent first), not exercise name", () => {
    const logs = [
      makeWorkoutLog({ id: "squat", date: "2026-01-01", exercise: "Squat", weightKg: 60, updatedAt: Date.parse("2026-01-01T18:30:00Z") }),
      makeWorkoutLog({ id: "bench", date: "2026-01-01", exercise: "Bench Press", weightKg: 40, updatedAt: Date.parse("2026-01-01T18:00:00Z") }),
    ];
    const timeline = workoutTimeline(logs);
    // Alphabetically "Bench Press" < "Squat", but Squat was logged later —
    // most-recent-first must put it first regardless of exercise name.
    expect(timeline.map((e) => e.id)).toEqual(["squat", "bench"]);
  });
});

// Regression: RawWorkoutLog.weightKg's own doc comment says "every read
// site pairs it with the resolved unit label rather than assuming kg" —
// workoutStatsByExercise/describeProgression/workoutInsight used to always
// say "kg" regardless of what the exercise was actually configured for.
describe("unit propagation (kg vs a configured non-kg unit)", () => {
  it("workoutStatsByExercise defaults to kg with no unit map, and uses a passed-in unit otherwise", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01", exercise: "Running", weightKg: 30 })];
    expect(workoutStatsByExercise(logs)[0].unit).toBe("kg");
    expect(workoutStatsByExercise(logs, new Map([["Running", "minutes"]]))[0].unit).toBe("minutes");
  });

  it("describeProgression uses the stats' unit (abbreviated via workoutUnitLabel), not a hardcoded kg", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-01", exercise: "Running", weightKg: 30 }),
      makeWorkoutLog({ date: "2026-01-08", exercise: "Running", weightKg: 35 }),
    ];
    const [stats] = workoutStatsByExercise(logs, new Map([["Running", "minutes"]]));
    const description = describeProgression(stats);
    expect(description).toContain("min"); // workoutUnitLabel("minutes") -> "min"
    expect(description).not.toMatch(/\bkg\b/);
  });

  it("workoutInsight's PR headline uses the exercise's configured unit", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-01", exercise: "Running", weightKg: 30 }),
      makeWorkoutLog({ date: "2026-01-08", exercise: "Running", weightKg: 35 }), // a new best -> triggers the PR headline
    ];
    const insight = workoutInsight(logs, "2026-01-08", new Map([["Running", "minutes"]]));
    expect(insight?.headline).toContain("min"); // workoutUnitLabel("minutes") -> "min"
    expect(insight?.headline).not.toMatch(/\bkg\b/);
  });
});
