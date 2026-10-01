import { describe, expect, it } from "vitest";
import { listDatesBetween } from "./common";
import { isScheduledDay, scheduleLabel, scheduledAdherence, scheduledStreak } from "./schedule";

// 2026-09-07 is a Monday.
const weeks = (n: number) => listDatesBetween("2026-09-07", `2026-09-${String(6 + n * 7).padStart(2, "0")}`);
const TODAY = "2026-10-01";

describe("scheduleLabel", () => {
  it("reads naturally", () => {
    expect(scheduleLabel(undefined)).toBe("Every day");
    expect(scheduleLabel({ kind: "weekly", times: 3 })).toBe("3× a week");
    expect(scheduleLabel({ kind: "days", days: [3, 0] })).toBe("Mon, Thu");
  });
});

describe("scheduledAdherence", () => {
  it("counts every day with no schedule", () => {
    const dates = weeks(1);
    expect(scheduledAdherence(dates, new Set(dates.slice(0, 7)), undefined, TODAY).pct).toBe(100);
    expect(scheduledAdherence(dates, new Set(dates.slice(0, 1)), undefined, TODAY).pct).toBe(14.3);
  });

  it("only expects the chosen weekdays", () => {
    const dates = weeks(2);
    const mondays = new Set(dates.filter((d) => isScheduledDay({ kind: "days", days: [0] }, d)));
    const result = scheduledAdherence(dates, mondays, { kind: "days", days: [0] }, TODAY);
    expect(result.pct).toBe(100);
    expect(result.done).toBe(2);
  });

  it("lets a weekly item reach 100% and doesn't credit extra days", () => {
    const dates = weeks(2);
    const done = new Set(["2026-09-07", "2026-09-09", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"]);
    // Week 1: 2 of 2; week 2: 4 logged, still 2 of 2.
    expect(scheduledAdherence(dates, done, { kind: "weekly", times: 2 }, TODAY).pct).toBe(100);
    expect(scheduledAdherence(dates, new Set(["2026-09-07"]), { kind: "weekly", times: 2 }, TODAY).pct).toBe(25);
  });

  it("doesn't count today as missed before it's logged", () => {
    expect(scheduledAdherence([TODAY], new Set(), undefined, TODAY).pct).toBeNull();
    expect(scheduledAdherence([TODAY], new Set([TODAY]), undefined, TODAY).pct).toBe(100);
  });

  it("never counts the week in progress against a weekly item", () => {
    const dates = listDatesBetween("2026-09-28", TODAY); // Mon–Thu of this week
    expect(scheduledAdherence(dates, new Set(), { kind: "weekly", times: 3 }, TODAY).pct).toBeNull();
  });
});

describe("scheduledStreak", () => {
  it("runs over scheduled days only and ignores today until it's logged", () => {
    const dates = listDatesBetween("2026-09-21", TODAY);
    const schedule = { kind: "days" as const, days: [0, 3] }; // Mon, Thu
    const done = new Set(["2026-09-21", "2026-09-24", "2026-09-28"]);
    expect(scheduledStreak(dates, done, schedule, "current", TODAY)).toBe(3);
    expect(scheduledStreak(dates, done, { kind: "weekly", times: 2 }, "current", TODAY)).toBeNull();
  });
});
