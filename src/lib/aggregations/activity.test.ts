import { describe, expect, it } from "vitest";
import { buildActivityFeed, buildActivityDateMap } from "./activity";
import { makeEvent } from "@/lib/testFixtures";
import type { RawWorkoutLog, RawPeriodLog } from "@/lib/types";

function makeWorkoutLog(overrides: Partial<RawWorkoutLog> = {}): RawWorkoutLog {
  return {
    id: `workout-${Math.random()}`,
    date: "2026-01-01",
    exercise: "Squat",
    weightKg: 60,
    updatedAt: Date.parse("2026-01-01T18:00:00Z"),
    ...overrides,
  };
}

function makePeriodLog(overrides: Partial<RawPeriodLog> = {}): RawPeriodLog {
  return {
    id: `period-${Math.random()}`,
    date: "2026-01-01",
    intensity: "Medium",
    collectionMethods: [],
    updatedAt: Date.parse("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("buildActivityFeed", () => {
  it("returns an empty list for no data", () => {
    expect(buildActivityFeed([], [], [])).toEqual([]);
  });

  it("groups same-day, same-meal-tag food events into one entry", () => {
    const events = [
      makeEvent({ item: "Eggs", updatedAt: "2026-01-01T08:00:00.000Z" }),
      makeEvent({ item: "Toast", updatedAt: "2026-01-01T08:05:00.000Z" }),
    ];
    const feed = buildActivityFeed(events, [], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].domain).toBe("food");
    expect(feed[0].description).toBe("Eggs & Toast");
  });

  it("excludes an incomplete (value 0) food event", () => {
    const events = [makeEvent({ completed: false })];
    expect(buildActivityFeed(events, [], [])).toEqual([]);
  });

  it("includes one entry per workout log", () => {
    const logs = [makeWorkoutLog({ id: "a" }), makeWorkoutLog({ id: "b", exercise: "Bench Press" })];
    const feed = buildActivityFeed([], logs, []);
    expect(feed).toHaveLength(2);
    expect(feed.every((e) => e.domain === "workout")).toBe(true);
  });

  it("includes one entry per outcome (symptom) event, skipping other item types", () => {
    const events = [makeEvent({ itemType: "outcome", item: "Headache" }), makeEvent({ itemType: "habit", item: "Walk" })];
    const feed = buildActivityFeed(events, [], []);
    expect(feed).toHaveLength(1);
    expect(feed[0].domain).toBe("symptom");
  });

  it("collapses a multi-day period run into one entry at its start date", () => {
    const logs = [makePeriodLog({ date: "2026-01-01" }), makePeriodLog({ date: "2026-01-02" }), makePeriodLog({ date: "2026-01-03" })];
    const feed = buildActivityFeed([], [], logs);
    expect(feed).toHaveLength(1);
    expect(feed[0].date).toBe("2026-01-01");
    expect(feed[0].description).toContain("3 days");
  });

  it("sorts most recent first across domains", () => {
    const events = [makeEvent({ date: "2026-01-01", updatedAt: "2026-01-01T08:00:00.000Z" })];
    const logs = [makeWorkoutLog({ date: "2026-01-03", updatedAt: Date.parse("2026-01-03T08:00:00Z") })];
    const feed = buildActivityFeed(events, logs, []);
    expect(feed.map((e) => e.domain)).toEqual(["workout", "food"]);
  });

  it("orders by the entry's real date, not when it was recorded", () => {
    // A symptom that happened on 2026-01-01 but was typed in on 2026-01-20.
    const backdated = makeEvent({ itemType: "outcome", item: "Cramp", date: "2026-01-01", updatedAt: "2026-01-20T21:00:00.000Z" });
    const recent = makeEvent({ item: "Lunch", date: "2026-01-10", updatedAt: "2026-01-10T12:00:00.000Z" });
    const feed = buildActivityFeed([backdated, recent], [], []);
    expect(feed.map((e) => e.date)).toEqual(["2026-01-10", "2026-01-01"]);
  });
});

describe("buildActivityDateMap", () => {
  it("maps a date to every domain active that day", () => {
    const events = [makeEvent({ date: "2026-01-01", itemType: "food" }), makeEvent({ date: "2026-01-01", itemType: "outcome" })];
    const logs = [makeWorkoutLog({ date: "2026-01-01" })];
    const periods = [makePeriodLog({ date: "2026-01-01" })];
    const map = buildActivityDateMap(events, logs, periods);
    expect(map.get("2026-01-01")).toEqual(new Set(["food", "symptom", "workout", "cycle"]));
  });

  it("marks every logged day of a period, not just its start", () => {
    const periods = [makePeriodLog({ date: "2026-01-01" }), makePeriodLog({ date: "2026-01-02" })];
    const map = buildActivityDateMap([], [], periods);
    expect(map.get("2026-01-01")).toEqual(new Set(["cycle"]));
    expect(map.get("2026-01-02")).toEqual(new Set(["cycle"]));
  });

  it("ignores an incomplete food/outcome event", () => {
    const events = [makeEvent({ completed: false })];
    const map = buildActivityDateMap(events, [], []);
    expect(map.size).toBe(0);
  });
});
