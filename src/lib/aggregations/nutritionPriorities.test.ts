import { describe, expect, it } from "vitest";
import { computeNutritionPriorities } from "./nutritionPriorities";
import { makeEvent } from "@/lib/testFixtures";

describe("computeNutritionPriorities", () => {
  it("reports insufficientData for no events", () => {
    const result = computeNutritionPriorities([], null);
    expect(result.insufficientData).toBe(true);
    expect(result.topPriorities).toEqual([]);
    expect(result.doingWell).toEqual([]);
    expect(result.trend).toEqual({ available: false, rangeLengthDays: 0, points: [] });
  });

  it("reports insufficientData with too few days of food tracking, even with other data present", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Apple", category: "Fruit", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "habit", date: "2026-01-01" }),
    ];
    const range = { start: "2026-01-01", end: "2026-01-01" };
    expect(computeNutritionPriorities(events, range).insufficientData).toBe(true);
  });

  it("ignores non-food events entirely when judging food-tracking coverage", () => {
    const events = Array.from({ length: 30 }, (_, i) => makeEvent({ itemType: "habit", date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    const range = { start: "2026-01-01", end: "2026-01-28" };
    expect(computeNutritionPriorities(events, range).insufficientData).toBe(true);
  });

  it("recalculates for the selected range — a group logged only outside the range reads as not-recent, not as its all-time state", () => {
    const events = [
      // Logged plenty in December, nothing in the selected January range.
      ...Array.from({ length: 15 }, (_, i) => makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", date: `2025-12-${String(i + 1).padStart(2, "0")}`, completed: true })),
      // Enough January food-tracking days to clear the confidence gate.
      ...Array.from({ length: 12 }, (_, i) => makeEvent({ itemType: "food", item: "Rice", category: "Grains", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true })),
    ];
    const range = { start: "2026-01-01", end: "2026-01-12" };
    const result = computeNutritionPriorities(events, range);
    expect(result.insufficientData).toBe(false);
    const leafyGreens = result.groupStates.find((s) => s.group === "leafy_greens")!;
    expect(leafyGreens.daysInRange).toBe(0);
    expect(leafyGreens.totalLogsAllTime).toBe(15); // still known to exist, just not in this range
    expect(leafyGreens.consistency).toBe("not-recent");
  });
});
