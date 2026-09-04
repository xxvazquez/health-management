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

  it("builds the six pillars worst-represented first, with the frequency behind each verdict", () => {
    // Spinach (leafy greens) every day of a 20-day range; nothing else.
    const events = Array.from({ length: 20 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-20" };
    const { pillars } = computeNutritionPriorities(events, range);

    expect(pillars.map((p) => p.pillar)).toHaveLength(6);
    // Worst first: the five empty pillars lead, vegetables last.
    expect(pillars[pillars.length - 1].pillar).toBe("vegetables");
    expect(pillars[0].status).toBe("underrepresented");

    const veg = pillars.find((p) => p.pillar === "vegetables")!;
    expect(veg.daysInRange).toBe(20);
    expect(veg.rangeLengthDays).toBe(20);
    expect(veg.percent).toBe(100);
    expect(veg.notTracked).toBe(false);

    const legumes = pillars.find((p) => p.pillar === "legumes")!;
    expect(legumes.notTracked).toBe(true);
    expect(legumes.percent).toBe(0);
  });

  it("excludes the Spices category from variety and coverage entirely", () => {
    const base = Array.from({ length: 12 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Rice", category: "Grains", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-12" };
    const withoutSpices = computeNutritionPriorities(base, range);
    const withSpices = computeNutritionPriorities(
      [...base, ...["Cinnamon", "Turmeric", "Paprika"].map((item, i) => makeEvent({ itemType: "food", item, category: "Spices", date: `2026-01-0${i + 1}`, completed: true }))],
      range,
    );
    expect(withSpices.variety.totalUniqueFoods).toBe(withoutSpices.variety.totalUniqueFoods);
    expect(withSpices.daysWithFoodTracked).toBe(withoutSpices.daysWithFoodTracked);
  });
});
