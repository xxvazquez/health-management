import { describe, expect, it } from "vitest";
import { workoutExerciseSummaries, workoutTrainedDates, workoutWeeklySessions } from "./workout";
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

const units = new Map([
  ["Squat", "kg"],
  ["Walking", "minutes"],
]);

describe("workoutTrainedDates", () => {
  it("is the set of distinct dates with any entry", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-01" }), makeWorkoutLog({ date: "2026-01-01", exercise: "Walking" }), makeWorkoutLog({ date: "2026-01-03" })];
    expect(workoutTrainedDates(logs)).toEqual(new Set(["2026-01-01", "2026-01-03"]));
  });
});

describe("workoutExerciseSummaries", () => {
  const logs = [
    makeWorkoutLog({ date: "2026-01-05", weightKg: 40 }),
    makeWorkoutLog({ date: "2026-01-05", weightKg: 45 }),
    makeWorkoutLog({ date: "2026-01-12", weightKg: 42 }),
    makeWorkoutLog({ date: "2026-01-05", exercise: "Walking", weightKg: 20 }),
    makeWorkoutLog({ date: "2026-01-05", exercise: "Walking", weightKg: 30 }),
    makeWorkoutLog({ date: "2026-01-06", exercise: "Walking", weightKg: 40 }),
    makeWorkoutLog({ date: "2026-01-07", exercise: "Walking", weightKg: 10 }),
    makeWorkoutLog({ date: "2025-12-01", weightKg: 100 }),
  ];
  const range = { start: "2026-01-01", end: "2026-01-31" };

  it("takes a lift's heaviest entry per day and adds up a timed exercise's day", () => {
    const [walking, squat] = workoutExerciseSummaries(logs, range, units);
    expect(walking).toMatchObject({ exercise: "Walking", timed: true, total: 100, average: 33.3 });
    expect(walking.sessions[0]).toEqual({ date: "2026-01-05", value: 50 });
    expect(squat).toMatchObject({ exercise: "Squat", timed: false, best: { date: "2026-01-05", value: 45 }, last: { date: "2026-01-12", value: 42 } });
  });

  it("leaves out entries outside the range and orders by sessions", () => {
    const summaries = workoutExerciseSummaries(logs, range, units);
    expect(summaries.map((s) => s.exercise)).toEqual(["Walking", "Squat"]);
    expect(summaries[1].sessions).toHaveLength(2);
  });

  it("treats an exercise without a known unit as kg", () => {
    const [s] = workoutExerciseSummaries([makeWorkoutLog({ exercise: "Row", date: "2026-01-02" })], range);
    expect(s).toMatchObject({ unit: "kg", timed: false });
  });
});

describe("workoutWeeklySessions", () => {
  it("counts days trained per Monday-start week, empty weeks included", () => {
    const logs = [
      makeWorkoutLog({ date: "2026-01-05" }),
      makeWorkoutLog({ date: "2026-01-05", exercise: "Walking" }),
      makeWorkoutLog({ date: "2026-01-07" }),
      makeWorkoutLog({ date: "2026-01-21" }),
      makeWorkoutLog({ date: "2026-02-02" }),
    ];
    expect(workoutWeeklySessions(logs, { start: "2026-01-05", end: "2026-01-25" })).toEqual([
      { weekStart: "2026-01-05", sessions: 2 },
      { weekStart: "2026-01-12", sessions: 0 },
      { weekStart: "2026-01-19", sessions: 1 },
    ]);
  });

  it("counts the first week whole when the range starts mid-week", () => {
    const logs = [makeWorkoutLog({ date: "2026-01-05" }), makeWorkoutLog({ date: "2026-01-08" }), makeWorkoutLog({ date: "2026-01-12" })];
    expect(workoutWeeklySessions(logs, { start: "2026-01-07", end: "2026-01-13" })).toEqual([
      { weekStart: "2026-01-05", sessions: 2 },
      { weekStart: "2026-01-12", sessions: 1 },
    ]);
  });
});
