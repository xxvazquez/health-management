import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/testFixtures";
import { addDaysToDate } from "./common";
import { currentSupplements, previousRange, symptomSummaries } from "./visitSummary";

const day = (n: number) => addDaysToDate("2026-01-01", n);

describe("previousRange", () => {
  it("is the same length, ending the day before", () => {
    expect(previousRange({ start: "2026-03-01", end: "2026-03-10" })).toEqual({ start: "2026-02-19", end: "2026-02-28" });
  });
});

describe("symptomSummaries", () => {
  // Symptoms logged every day for 60 days; Headache throughout, Rash only in the second month.
  const events = Array.from({ length: 60 }, (_, n) => n).flatMap((n) => [
    makeEvent({ itemType: "outcome", item: "Tracker", category: "Other Symptom", date: day(n), value: 0, completed: false }),
    ...(n % 3 === 0 ? [makeEvent({ itemType: "outcome", item: "Headache", category: "Pain", date: day(n), value: n < 30 ? 1 : 3 })] : []),
    ...(n >= 30 && n % 5 === 0 ? [makeEvent({ itemType: "outcome", item: "Rash", category: "Skin", date: day(n), value: 1 })] : []),
  ]);
  const range = { start: day(30), end: day(59) };

  it("counts days and the average level, with the period before when it was being logged", () => {
    const [headache, rash] = symptomSummaries(events, range);
    expect(headache).toMatchObject({ item: "Headache", days: 10, trackedDays: 30, averageLevel: 3, previous: { days: 10, trackedDays: 30 } });
    expect(rash).toMatchObject({ item: "Rash", days: 6, averageLevel: null, previous: null });
  });
});

describe("currentSupplements", () => {
  it("lists what was taken in the last four weeks, most often first", () => {
    const events = Array.from({ length: 60 }, (_, n) => n).flatMap((n) => [
      makeEvent({ itemType: "supplement", item: "Iron", category: "Medication", date: day(n), itemIdentity: "iron" }),
      ...(n < 20 ? [makeEvent({ itemType: "supplement", item: "Old", category: "Other", date: day(n), itemIdentity: "old" })] : []),
      ...(n % 2 === 0 ? [makeEvent({ itemType: "supplement", item: "Folate", category: "Other", date: day(n), itemIdentity: "folate" })] : []),
    ]);
    const list = currentSupplements(events, { start: day(0), end: day(59) });
    expect(list.map((s) => [s.item, s.recentDays])).toEqual([
      ["Iron", 28],
      ["Folate", 14],
    ]);
  });
});
