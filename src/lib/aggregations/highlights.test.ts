import { describe, expect, it } from "vitest";
import { computeHighlights, highlightWindows, type HighlightInput } from "./highlights";
import { addDaysToDate, listDatesBetween } from "./common";
import { makeEvent, makeStoolLog } from "@/lib/testFixtures";
import type { RawWorkoutLog, WorkoutUnit } from "@/lib/types";

const TODAY = "2026-10-16";
const w = highlightWindows(TODAY);
const nowDays = listDatesBetween(w.now.start, w.now.end);
const beforeDays = listDatesBetween(w.before.start, w.before.end);

function input(overrides: Partial<HighlightInput>): HighlightInput {
  return { events: [], workoutLogs: [], stoolLogs: [], checkIns: [], unitByExercise: new Map(), schedules: {}, today: TODAY, ...overrides };
}

function workout(date: string, exercise: string, value: number): RawWorkoutLog {
  return { id: `${exercise}-${date}`, date, exercise, weightKg: value, updatedAt: 0 };
}

/** A food logged every day of both windows, so the app counts as used. */
const dailyUse = [...beforeDays, ...nowDays].map((date) => makeEvent({ date, item: "Rice", itemType: "food" }));

describe("highlightWindows", () => {
  it("compares the 30 days ending yesterday with the 30 before", () => {
    expect(w.now).toEqual({ start: "2026-09-16", end: "2026-10-15" });
    expect(w.before).toEqual({ start: "2026-08-17", end: "2026-09-15" });
  });
});

describe("computeHighlights", () => {
  it("averages steps over days with a count, ignoring today", () => {
    const units = new Map<string, WorkoutUnit>([["Steps", "steps"]]);
    const workoutLogs = [
      ...beforeDays.map((d) => workout(d, "Steps", 6000)),
      ...nowDays.filter((_, i) => i % 2 === 0).map((d) => workout(d, "Steps", 9000)),
      workout(TODAY, "Steps", 100),
    ];
    const [steps] = computeHighlights(input({ workoutLogs, unitByExercise: units }));
    expect(steps).toMatchObject({ id: "steps", title: "More steps", now: 9000, before: 6000 });
  });

  it("leaves out a change below the floor", () => {
    const units = new Map<string, WorkoutUnit>([["Steps", "steps"]]);
    const workoutLogs = [...beforeDays.map((d) => workout(d, "Steps", 8000)), ...nowDays.map((d) => workout(d, "Steps", 8300))];
    expect(computeHighlights(input({ workoutLogs, unitByExercise: units }))).toEqual([]);
  });

  it("counts symptom days only when symptom logging covered both windows", () => {
    const symptoms = [
      ...beforeDays.filter((_, i) => i % 3 === 0).map((date) => makeEvent({ date, item: "Bloating", itemType: "outcome" })),
      makeEvent({ date: nowDays[0], item: "Bloating", itemType: "outcome" }),
      makeEvent({ date: nowDays[25], item: "Headache", itemType: "outcome" }),
    ];
    const result = computeHighlights(input({ events: [...dailyUse, ...symptoms] }));
    expect(result.find((h) => h.id === "symptom:Bloating")).toMatchObject({ title: "Fewer days with Bloating", now: 1, before: 10 });
    // A single Headache day isn't a change worth showing.
    expect(result.some((h) => h.id === "symptom:Headache")).toBe(false);
  });

  it("skips symptoms when logging stopped for a month", () => {
    const symptoms = beforeDays.filter((_, i) => i % 3 === 0).map((date) => makeEvent({ date, item: "Bloating", itemType: "outcome" }));
    const onlyBefore = beforeDays.map((date) => makeEvent({ date, item: "Rice", itemType: "food" }));
    const result = computeHighlights(input({ events: [...onlyBefore, ...symptoms] }));
    expect(result.some((h) => h.section === "Symptoms")).toBe(false);
  });

  it("measures supplements against their schedule", () => {
    const vitD = [
      ...beforeDays.map((date) => makeEvent({ date, item: "Vitamin D", itemType: "supplement", itemIdentity: "vd" })),
      ...nowDays.filter((_, i) => i % 2 === 0).map((date) => makeEvent({ date, item: "Vitamin D", itemType: "supplement", itemIdentity: "vd" })),
    ];
    const daily = computeHighlights(input({ events: [...dailyUse, ...vitD] })).find((h) => h.id === "supplement:Vitamin D");
    expect(daily).toMatchObject({ title: "Vitamin D less often", now: 50, before: 100, format: "percent" });
    // Every other day is exactly the plan for 3× a week, so nothing changed.
    const weekly = computeHighlights(input({ events: [...dailyUse, ...vitD], schedules: { vd: { kind: "weekly", times: 3 } } }));
    expect(weekly.some((h) => h.id === "supplement:Vitamin D")).toBe(false);
  });

  it("averages mood over rated days", () => {
    const checkIns = [
      ...beforeDays.slice(0, 10).map((date) => ({ date, mood: 2, energy: null, note: "" })),
      ...nowDays.slice(0, 10).map((date) => ({ date, mood: 4, energy: null, note: "" })),
    ];
    const result = computeHighlights(input({ checkIns }));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "mood", title: "Better mood", now: 4, before: 2, scaleMax: 5 });
  });

  it("compares hard or loose stools as a share of days with a movement", () => {
    const stoolLogs = [
      ...beforeDays.slice(0, 10).map((date, i) => makeStoolLog({ date, bristolScores: [i < 5 ? 6 : 4] })),
      ...nowDays.slice(0, 10).map((date, i) => makeStoolLog({ date, bristolScores: [i < 1 ? 1 : 4] })),
    ];
    const [stool] = computeHighlights(input({ stoolLogs }));
    expect(stool).toMatchObject({ id: "stool", title: "Fewer hard or loose stools", now: 10, before: 50 });
  });

  it("puts the biggest change first", () => {
    const units = new Map<string, WorkoutUnit>([["Steps", "steps"]]);
    const workoutLogs = [...beforeDays.map((d) => workout(d, "Steps", 6000)), ...nowDays.map((d) => workout(d, "Steps", 7000))];
    const checkIns = [
      ...beforeDays.slice(0, 10).map((date) => ({ date, mood: 1, energy: null, note: "" })),
      ...nowDays.slice(0, 10).map((date) => ({ date, mood: 4, energy: null, note: "" })),
    ];
    expect(computeHighlights(input({ workoutLogs, unitByExercise: units, checkIns })).map((h) => h.id)).toEqual(["mood", "steps"]);
  });

  it("only compares food variety over a similar number of food days", () => {
    const before = beforeDays.flatMap((date, i) => [makeEvent({ date, item: `Food ${i % 10}` })]);
    const now = nowDays.slice(0, 15).flatMap((date, i) => [makeEvent({ date, item: `Food ${i}` })]);
    expect(computeHighlights(input({ events: [...before, ...now] })).some((h) => h.id === "variety")).toBe(false);
    const fullNow = nowDays.map((date, i) => makeEvent({ date, item: `Food ${i % 20}` }));
    expect(computeHighlights(input({ events: [...before, ...fullNow] })).find((h) => h.id === "variety")).toMatchObject({ now: 20, before: 10 });
  });

  it("starts non-workout comparisons at the analytics start date", () => {
    const early = "2026-02-10";
    const ew = highlightWindows(early);
    const checkIns = listDatesBetween(addDaysToDate(ew.before.start, 0), ew.now.end).map((date, i) => ({ date, mood: i < 30 ? 1 : 5, energy: null, note: "" }));
    expect(computeHighlights(input({ checkIns, today: early }))).toEqual([]);
  });
});
