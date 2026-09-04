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
    expect(veg.percentOfTarget).toBe(100); // 7/week rate against a 7/week target
    expect(veg.notTracked).toBe(false);

    const legumes = pillars.find((p) => p.pillar === "legumes")!;
    expect(legumes.notTracked).toBe(true);
    expect(legumes.percentOfTarget).toBe(0);
  });

  it("shows progress toward each pillar's own weekly target, not a raw day-coverage percentage", () => {
    // Salmon (fatty fish, target 2x/week) logged 30 of 76 days — well
    // above its target rate — should read far higher than its ~39% of
    // days would suggest, and higher than a pillar with a daily target
    // logged on a larger share of days.
    const events = Array.from({ length: 30 }, (_, i) => makeEvent({ item: "Salmon", category: "Fish", date: `2026-01-${String(i + 1).padStart(2, "0")}` })); // Jan 1-30
    const range = { start: "2026-01-01", end: "2026-03-17" }; // 76 days
    const { pillars } = computeNutritionPriorities(events, range);
    const fish = pillars.find((p) => p.pillar === "fish")!;
    expect(fish.targetPerWeek).toBe(2);
    expect(fish.percentOfTarget).toBeGreaterThan(100);
    expect(fish.status).toBe("strongly-represented");
  });

  it("applies an override before classifying, changing which pillar a food counts toward", () => {
    // "Zorbleflax" matches no keyword, so it's normally unclassified.
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Zorbleflax", category: "Misc", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-15" };

    const withoutOverride = computeNutritionPriorities(events, range);
    expect(withoutOverride.pillars.find((p) => p.pillar === "legumes")!.daysInRange).toBe(0);

    const withOverride = computeNutritionPriorities(events, range, { zorbleflax: "legumes" });
    expect(withOverride.pillars.find((p) => p.pillar === "legumes")!.daysInRange).toBe(15);
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
