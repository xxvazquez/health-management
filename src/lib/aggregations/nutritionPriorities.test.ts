import { describe, expect, it } from "vitest";
import { computeNutritionPriorities } from "./nutritionPriorities";
import { makeEvent } from "@/lib/testFixtures";
import { resolveFoodTargets } from "@/lib/foodTargets";

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
    // Spinach (leafy greens) at lunch and dinner every day of a 20-day range; nothing else.
    const events = Array.from({ length: 20 }, (_, i) =>
      ["Lunch", "Dinner"].map((mealTag) =>
        makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", mealTag, date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
      ),
    ).flat();
    const range = { start: "2026-01-01", end: "2026-01-20" };
    const { pillars } = computeNutritionPriorities(events, range);

    expect(pillars.map((p) => p.pillar)).toHaveLength(6);
    // Worst first: the five empty pillars lead, vegetables last.
    expect(pillars[pillars.length - 1].pillar).toBe("vegetables");
    expect(pillars[0].status).toBe("underrepresented");

    const veg = pillars.find((p) => p.pillar === "vegetables")!;
    expect(veg.daysInRange).toBe(20);
    expect(veg.foodDays).toBe(20);
    expect(veg.percentOfTarget).toBe(100); // 14 meals a week against a 14-meal target
    expect(veg.notTracked).toBe(false);

    const legumes = pillars.find((p) => p.pillar === "legumes")!;
    expect(legumes.notTracked).toBe(true);
    expect(legumes.percentOfTarget).toBe(0);
  });

  it("divides by days with food logged, never the calendar range", () => {
    // Spinach at lunch and dinner on the first 10 days of a 30-day range; nothing logged after.
    const events = Array.from({ length: 10 }, (_, i) =>
      ["Lunch", "Dinner"].map((mealTag) =>
        makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", mealTag, date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
      ),
    ).flat();
    const { pillars } = computeNutritionPriorities(events, { start: "2026-01-01", end: "2026-01-30" });
    const veg = pillars.find((p) => p.pillar === "vegetables")!;
    expect(veg.foodDays).toBe(10);
    expect(veg.rateInRangePerWeek).toBe(14);
  });

  it("counts meals that included a group, not foods or days", () => {
    const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;
    // Every day: carrot and spinach together at lunch (one meal), spinach again at dinner.
    const events = Array.from({ length: 14 }, (_, i) => [
      makeEvent({ itemType: "food", item: "Carrot", category: "Veggies", mealTag: "Lunch", date: day(i + 1), completed: true }),
      makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", mealTag: "Lunch", date: day(i + 1), completed: true }),
      makeEvent({ itemType: "food", item: "Spinach", category: "Veggies", mealTag: "Dinner", date: day(i + 1), completed: true }),
    ]).flat();
    const { pillars } = computeNutritionPriorities(events, { start: day(1), end: day(14) });
    const veg = pillars.find((p) => p.pillar === "vegetables")!;
    expect(veg.rateInRangePerWeek).toBe(14);
    expect(veg.daysInRange).toBe(14);
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

  it("stops counting a food marked Not counted", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Lentils", category: "Legumes", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-15" };
    const counted = computeNutritionPriorities(events, range);
    const excluded = computeNutritionPriorities(events, range, { lentils: "none" });
    const days = (r: typeof counted) => r.pillars.reduce((sum, p) => sum + p.daysInRange, 0);
    expect(days(counted)).toBeGreaterThan(0);
    expect(days(excluded)).toBe(0);
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
  it("counts fresh herbs as plant foods, unlike spices", () => {
    const base = Array.from({ length: 12 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Rice", category: "Grains", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-12" };
    const without = computeNutritionPriorities(base, range);
    const withHerbs = computeNutritionPriorities(
      [...base, ...["Parsley", "Dill"].map((item, i) => makeEvent({ itemType: "food", item, category: "Herbs", date: `2026-01-0${i + 1}`, completed: true }))],
      range,
    );
    expect(withHerbs.variety.uniquePlantFoods).toBe(without.variety.uniquePlantFoods + 2);
  });

  it("judges each pillar against the user's targets and leaves out a pillar set to off", () => {
    // Rice every day, lentils every other day: 3.5 days a week.
    const events = Array.from({ length: 20 }, (_, i) => [
      makeEvent({ itemType: "food", item: "Rice", category: "Grains", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
      ...(i % 2 === 0
        ? [makeEvent({ itemType: "food", item: "Lentils", category: "Legumes", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true })]
        : []),
    ]).flat();
    const range = { start: "2026-01-01", end: "2026-01-20" };
    const targets = resolveFoodTargets({ diet: "vegetarian", groups: { legumes: { mode: "min", perWeek: 7 } } });
    const result = computeNutritionPriorities(events, range, {}, targets);

    expect(result.pillars.map((p) => p.pillar)).not.toContain("fish");
    expect(result.groupStates.map((s) => s.group)).not.toContain("fatty_fish");
    expect(result.coverageTable.map((r) => r.label)).not.toContain("Fatty fish");

    const legumes = result.pillars.find((p) => p.pillar === "legumes")!;
    expect(legumes.targetPerWeek).toBe(7);
    expect(legumes.percentOfTarget).toBe(50);
  });

  it("measures a limit like red meat as meals a week against its maximum", () => {
    const events = Array.from({ length: 14 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Beef", category: "Meat", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-14" };
    const { extraRows } = computeNutritionPriorities(events, range, {}, resolveFoodTargets(undefined), [{ group: "meat", mode: "max", perWeek: 4 }]);
    expect(extraRows).toHaveLength(1);
    expect(extraRows[0]).toMatchObject({ group: "meat", mode: "max", targetPerWeek: 4, onTarget: false });
    expect(extraRows[0].rateInRangePerWeek).toBe(7);
  });

  it("scales a pillar's subgroup targets with the pillar", () => {
    const events = Array.from({ length: 12 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Rice", category: "Grains", date: `2026-01-${String(i + 1).padStart(2, "0")}`, completed: true }),
    );
    const range = { start: "2026-01-01", end: "2026-01-12" };
    const doubled = resolveFoodTargets({ groups: { fish: { mode: "min", perWeek: 4 } } });
    const { groupStates } = computeNutritionPriorities(events, range, {}, doubled);
    expect(groupStates.find((s) => s.group === "fatty_fish")!.targetPerWeek).toBe(4);
    expect(groupStates.find((s) => s.group === "leafy_greens")!.targetPerWeek).toBe(4);
  });

  it("doesn't count a garnish as a serving, but keeps it for variety", () => {
    const day = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;
    const events = Array.from({ length: 14 }, (_, i) => [
      makeEvent({ itemType: "food", item: "Rice", category: "Grains", mealTag: "Lunch", date: day(i + 1), completed: true }),
      makeEvent({ itemType: "food", item: "Lemon juice", category: "Misc", mealTag: "Lunch", date: day(i + 1), completed: true }),
    ]).flat();
    const result = computeNutritionPriorities(events, { start: day(1), end: day(14) });
    expect(result.pillars.find((p) => p.pillar === "fruit")!.rateInRangePerWeek).toBe(0);
    expect(result.variety.totalUniqueFoods).toBe(2);
  });
});
