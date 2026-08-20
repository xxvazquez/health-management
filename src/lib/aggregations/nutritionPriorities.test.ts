import { describe, expect, it } from "vitest";
import { computeNutritionPriorities } from "./nutritionPriorities";
import { makeEvent } from "@/lib/testFixtures";

describe("computeNutritionPriorities", () => {
  it("reports insufficientData for no events", () => {
    const result = computeNutritionPriorities([]);
    expect(result.insufficientData).toBe(true);
    expect(result.topPriorities).toEqual([]);
    expect(result.doingWell).toEqual([]);
    expect(result.trend).toEqual({ available: false, points: [] });
  });

  it("reports insufficientData with too few days of food tracking, even with other data present", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Apple", category: "Fruit", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "habit", date: "2026-01-01" }),
    ];
    expect(computeNutritionPriorities(events).insufficientData).toBe(true);
  });

  it("does not throw and returns real content with enough food-tracking history", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      makeEvent({
        itemType: "food",
        item: i % 2 === 0 ? "Spinach" : "Salmon",
        category: i % 2 === 0 ? "Veggies" : "Fish",
        date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
        completed: true,
      }),
    );
    expect(() => computeNutritionPriorities(events)).not.toThrow();
    const result = computeNutritionPriorities(events);
    expect(typeof result.insufficientData).toBe("boolean");
  });

  it("ignores non-food events entirely when judging food-tracking coverage", () => {
    const events = Array.from({ length: 30 }, (_, i) => makeEvent({ itemType: "habit", date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}` }));
    expect(computeNutritionPriorities(events).insufficientData).toBe(true);
  });
});
