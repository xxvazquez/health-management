import { describe, expect, it } from "vitest";
import { buildDayStory } from "./myDay";
import type { CanonicalEvent, RawWorkoutLog } from "@/lib/types";

function makeEvent(overrides: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: `event-${Math.random()}`,
    date: "2026-01-15",
    item: "Apple",
    itemType: "food",
    category: "Fruit",
    value: 1,
    completed: true,
    isArchived: false,
    source: "item-log",
    itemIdentity: "item-1",
    note: null,
    updatedAt: "2026-01-15T08:00:00.000Z",
    mealTag: "Breakfast",
    ...overrides,
  };
}

function makeWorkoutLog(overrides: Partial<RawWorkoutLog> = {}): RawWorkoutLog {
  return {
    id: `workout-${Math.random()}`,
    date: "2026-01-15",
    exercise: "Squat",
    weightKg: 80,
    updatedAt: Date.parse("2026-01-15T17:30:00.000Z"),
    ...overrides,
  };
}

describe("buildDayStory", () => {
  it("returns nothing for a day with no data", () => {
    const story = buildDayStory([], [], "2026-01-15");
    expect(story.entries).toEqual([]);
    expect(story.alsoLogged).toEqual([]);
    expect(story.fastingHours).toBeNull();
  });

  it("groups food by meal tag into one entry, joined naturally", () => {
    const events = [
      makeEvent({ item: "Eggs", mealTag: "Breakfast", updatedAt: "2026-01-15T08:00:00.000Z" }),
      makeEvent({ item: "Toast", mealTag: "Breakfast", updatedAt: "2026-01-15T08:01:00.000Z" }),
      makeEvent({ item: "Avocado", mealTag: "Breakfast", updatedAt: "2026-01-15T08:02:00.000Z" }),
    ];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.entries).toHaveLength(1);
    expect(story.entries[0]).toMatchObject({ kind: "meal", label: "Breakfast", description: "Eggs, Toast & Avocado" });
  });

  it("orders meals, exercise, and symptoms chronologically together", () => {
    const events = [
      makeEvent({ item: "Salmon", mealTag: "Lunch", updatedAt: "2026-01-15T12:45:00.000Z" }),
      makeEvent({ item: "Chicken", mealTag: "Dinner", updatedAt: "2026-01-15T20:00:00.000Z" }),
      makeEvent({ item: "Headache", itemType: "outcome", mealTag: null, updatedAt: "2026-01-15T14:00:00.000Z" }),
    ];
    const workoutLogs = [makeWorkoutLog({ exercise: "Walking", weightKg: 35, updatedAt: Date.parse("2026-01-15T17:30:00.000Z") })];
    const story = buildDayStory(events, workoutLogs, "2026-01-15");
    expect(story.entries.map((e) => e.kind)).toEqual(["meal", "symptom", "exercise", "meal"]);
    expect(story.entries.map((e) => e.label)).toEqual(["Lunch", "Symptom", "Exercise", "Dinner"]);
  });

  it("labels an exercise's logged value with its configured unit, not always kg", () => {
    const workoutLogs = [makeWorkoutLog({ exercise: "Walking", weightKg: 45 })];
    const story = buildDayStory([], workoutLogs, "2026-01-15", new Map([["Walking", "minutes"]]));
    expect(story.entries[0].description).toBe("Walking — 45 min");
  });

  it("keeps supplements and habits out of the timeline, as a name list instead", () => {
    const events = [
      makeEvent({ item: "Vitamin D", itemType: "supplement", mealTag: null }),
      makeEvent({ item: "Read", itemType: "habit", mealTag: null }),
      makeEvent({ item: "Vitamin D", itemType: "supplement", mealTag: null, id: "dup" }), // second dose, same day
    ];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.entries).toEqual([]);
    expect(story.alsoLogged).toEqual(["Read", "Vitamin D"]);
  });

  it("computes a fasting window only when both yesterday's and today's food exist", () => {
    const events = [
      makeEvent({ date: "2026-01-14", item: "Dinner food", updatedAt: "2026-01-14T20:00:00.000Z" }),
      makeEvent({ date: "2026-01-15", item: "Breakfast food", updatedAt: "2026-01-15T08:00:00.000Z" }),
    ];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.fastingHours).toBe(12);
  });

  it("omits the fasting window when yesterday has no food logged", () => {
    const events = [makeEvent({ date: "2026-01-15", updatedAt: "2026-01-15T08:00:00.000Z" })];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.fastingHours).toBeNull();
  });

  it("omits a short gap that isn't a meaningful fast", () => {
    const events = [
      makeEvent({ date: "2026-01-14", updatedAt: "2026-01-14T22:00:00.000Z" }),
      makeEvent({ date: "2026-01-15", updatedAt: "2026-01-15T02:00:00.000Z" }), // 4h gap
    ];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.fastingHours).toBeNull();
  });

  it("ignores incomplete (not actually completed) events", () => {
    const events = [makeEvent({ completed: false })];
    const story = buildDayStory(events, [], "2026-01-15");
    expect(story.entries).toEqual([]);
  });
});
