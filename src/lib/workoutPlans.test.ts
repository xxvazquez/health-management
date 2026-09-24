import { describe, expect, it } from "vitest";
import {
  addDays,
  describeSession,
  isoWeekday,
  liftBasesByWeek,
  mondayOf,
  nextPlannedDate,
  plannedSetsForWeek,
  plannedSetsOn,
  sessionTargetKg,
  suggestBaseKg,
  type LoggedValues,
  type WorkoutPlan,
} from "./workoutPlans";

// 2026-09-07 is a Monday.
function plan(overrides: Partial<WorkoutPlan> = {}): WorkoutPlan {
  return {
    id: "p1",
    name: "Squat 3x",
    startDate: "2026-09-07",
    weeks: null,
    holdOnMiss: true,
    isActive: true,
    lifts: [{ itemId: "squat", baseKg: 80, weeklyGainKg: 2.5 }],
    sessions: [
      { weekday: 1, itemId: "squat", mode: "kg", amount: 5 },
      { weekday: 3, itemId: "squat", mode: "kg", amount: 10 },
      { weekday: 5, itemId: "squat", mode: "percent", amount: 80 },
    ],
    createdDate: "2026-09-01",
    ...overrides,
  };
}

function logsFrom(entries: Record<string, number>): LoggedValues {
  return (itemId, date) => (entries[`${itemId}:${date}`] !== undefined ? [entries[`${itemId}:${date}`]] : []);
}

describe("date helpers", () => {
  it("finds the Monday of a week and the ISO weekday", () => {
    expect(mondayOf("2026-09-13")).toBe("2026-09-07");
    expect(mondayOf("2026-09-07")).toBe("2026-09-07");
    expect(isoWeekday("2026-09-13")).toBe(7);
    expect(addDays("2026-10-24", 8)).toBe("2026-11-01");
  });
});

describe("sessionTargetKg", () => {
  it("adds kg or takes a percentage, snapped to 0.25 kg", () => {
    expect(sessionTargetKg(80, { mode: "kg", amount: 5 })).toBe(85);
    expect(sessionTargetKg(80, { mode: "percent", amount: 80 })).toBe(64);
    expect(sessionTargetKg(81, { mode: "percent", amount: 80 })).toBe(64.75);
    expect(sessionTargetKg(10, { mode: "kg", amount: -20 })).toBe(0);
  });
});

describe("plannedSetsForWeek", () => {
  it("lays out week 1 from the base", () => {
    const sets = plannedSetsForWeek(plan(), "2026-09-07", "2026-09-07", logsFrom({}));
    expect(sets.map((s) => [s.date, s.targetKg, s.status])).toEqual([
      ["2026-09-07", 85, "today"],
      ["2026-09-09", 90, "upcoming"],
      ["2026-09-11", 64, "upcoming"],
    ]);
  });

  it("projects the weekly gain into future weeks", () => {
    const sets = plannedSetsForWeek(plan(), "2026-09-21", "2026-09-07", logsFrom({}));
    expect(sets.map((s) => s.targetKg)).toEqual([90, 95, 68]);
  });

  it("is empty outside the plan's run", () => {
    expect(plannedSetsForWeek(plan(), "2026-08-31", "2026-09-07", logsFrom({}))).toEqual([]);
    expect(plannedSetsForWeek(plan({ weeks: 2 }), "2026-09-21", "2026-09-07", logsFrom({}))).toEqual([]);
  });

  it("marks done, short and missed against the log", () => {
    const logged = logsFrom({ "squat:2026-09-07": 85, "squat:2026-09-09": 87.5 });
    const sets = plannedSetsForWeek(plan(), "2026-09-07", "2026-09-12", logged);
    expect(sets.map((s) => s.status)).toEqual(["done", "short", "missed"]);
  });

  it("never counts sets before the plan was created as missed", () => {
    const sets = plannedSetsForWeek(plan({ createdDate: "2026-09-10" }), "2026-09-07", "2026-09-10", logsFrom({}));
    expect(sets.map((s) => s.status)).toEqual(["skipped", "skipped", "upcoming"]);
  });
});

describe("liftBasesByWeek", () => {
  const fullWeek1 = { "squat:2026-09-07": 85, "squat:2026-09-09": 90, "squat:2026-09-11": 65 };

  it("adds the weekly gain after a completed week", () => {
    const bases = liftBasesByWeek(plan(), 2, "2026-09-15", logsFrom(fullWeek1));
    expect(bases.get("squat")).toEqual([80, 82.5, 85]);
  });

  it("holds the base after a week with a missed set", () => {
    const logged = logsFrom({ "squat:2026-09-07": 85, "squat:2026-09-09": 90 });
    const bases = liftBasesByWeek(plan(), 2, "2026-09-15", logged);
    expect(bases.get("squat")).toEqual([80, 80, 82.5]);
  });

  it("still adds the gain after a miss when hold is off", () => {
    const bases = liftBasesByWeek(plan({ holdOnMiss: false }), 1, "2026-09-15", logsFrom({}));
    expect(bases.get("squat")).toEqual([80, 82.5]);
  });

  it("tracks each lift on its own", () => {
    const p = plan({
      lifts: [
        { itemId: "squat", baseKg: 80, weeklyGainKg: 2.5 },
        { itemId: "bench", baseKg: 60, weeklyGainKg: 2.5 },
      ],
      sessions: [
        { weekday: 1, itemId: "squat", mode: "percent", amount: 80 },
        { weekday: 1, itemId: "bench", mode: "percent", amount: 80 },
      ],
    });
    const bases = liftBasesByWeek(p, 1, "2026-09-15", logsFrom({ "squat:2026-09-07": 65 }));
    expect(bases.get("squat")).toEqual([80, 82.5]);
    expect(bases.get("bench")).toEqual([60, 60]);
  });

  it("uses each lift's own weekly gain", () => {
    const p = plan({
      holdOnMiss: false,
      lifts: [
        { itemId: "squat", baseKg: 80, weeklyGainKg: 2.5 },
        { itemId: "bench", baseKg: 60, weeklyGainKg: 1.25 },
      ],
    });
    const bases = liftBasesByWeek(p, 2, "2026-09-07", logsFrom({}));
    expect(bases.get("squat")).toEqual([80, 82.5, 85]);
    expect(bases.get("bench")).toEqual([60, 61.25, 62.5]);
  });
});

describe("plannedSetsOn / nextPlannedDate", () => {
  it("returns only that day's sets", () => {
    expect(plannedSetsOn(plan(), "2026-09-09", "2026-09-07", logsFrom({})).map((s) => s.targetKg)).toEqual([90]);
    expect(plannedSetsOn(plan(), "2026-09-08", "2026-09-07", logsFrom({}))).toEqual([]);
  });

  it("finds the next training day", () => {
    expect(nextPlannedDate(plan(), "2026-09-11")).toBe("2026-09-14");
    expect(nextPlannedDate(plan({ weeks: 1 }), "2026-09-11")).toBeNull();
  });
});

describe("suggestBaseKg", () => {
  it("prefers the heaviest lift of the last 7 days, else the latest", () => {
    const logs = [
      { date: "2026-09-01", value: 90 },
      { date: "2026-09-18", value: 80 },
      { date: "2026-09-20", value: 82.5 },
    ];
    expect(suggestBaseKg(logs, "2026-09-21")).toBe(82.5);
    expect(suggestBaseKg(logs.slice(0, 1), "2026-09-21")).toBe(90);
    expect(suggestBaseKg([], "2026-09-21")).toBeNull();
  });
});

describe("describeSession", () => {
  it("reads naturally", () => {
    expect(describeSession({ mode: "kg", amount: 5 })).toBe("+5 kg");
    expect(describeSession({ mode: "kg", amount: -5 })).toBe("−5 kg");
    expect(describeSession({ mode: "kg", amount: 0 })).toBe("base");
    expect(describeSession({ mode: "percent", amount: 80 })).toBe("80%");
  });
});
