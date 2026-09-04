import { describe, expect, it } from "vitest";
import { favoriteCombosByMeal, foodCategoryDistribution, foodVarietyOverTime, ingredientRotation, mealInstances, newFoodsOverTime, rankedFoods } from "./food";
import { makeEvent } from "@/lib/testFixtures";

const inRangeDay = (n: number) => `2026-02-${String(n).padStart(2, "0")}`;
const beforeRangeDay = (n: number) => `2026-01-${String(n).padStart(2, "0")}`;
const RANGE = { start: "2026-02-01", end: "2026-02-10" }; // 10 days

describe("foodCategoryDistribution", () => {
  it("ignores non-food events entirely", () => {
    const events = [makeEvent({ itemType: "habit", category: "Other" })];
    expect(foodCategoryDistribution(events)).toEqual([]);
  });

  it("ignores incomplete (not-logged) food events", () => {
    const events = [makeEvent({ itemType: "food", category: "Fruit", completed: false, value: 0 })];
    expect(foodCategoryDistribution(events)).toEqual([]);
  });

  it("only produces a row for categories actually present in the data — no zero-filled fixed list", () => {
    const events = [makeEvent({ itemType: "food", category: "Fruit", item: "Apple" })];
    const dist = foodCategoryDistribution(events);
    expect(dist).toEqual([{ category: "Fruit", count: 1, uniqueFoods: 1, sharePct: 100 }]);
  });

  it("counts unique foods separately from total occurrences within a category", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Fruit", item: "Apple" }),
      makeEvent({ itemType: "food", category: "Fruit", item: "Apple" }),
      makeEvent({ itemType: "food", category: "Fruit", item: "Pear" }),
    ];
    const [fruit] = foodCategoryDistribution(events);
    expect(fruit.count).toBe(3);
    expect(fruit.uniqueFoods).toBe(2);
  });

  it("sorts categories by count descending and computes share of the food total", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Veggies", item: "Carrot" }),
      makeEvent({ itemType: "food", category: "Veggies", item: "Carrot" }),
      makeEvent({ itemType: "food", category: "Veggies", item: "Carrot" }),
      makeEvent({ itemType: "food", category: "Fruit", item: "Apple" }),
    ];
    const dist = foodCategoryDistribution(events);
    expect(dist.map((d) => d.category)).toEqual(["Veggies", "Fruit"]);
    expect(dist[0].sharePct).toBe(75);
    expect(dist[1].sharePct).toBe(25);
  });
});

describe("rankedFoods", () => {
  it("ranks foods by occurrence count, descending", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Rice", category: "Grains" }),
      makeEvent({ itemType: "food", item: "Rice", category: "Grains" }),
      makeEvent({ itemType: "food", item: "Beans", category: "Legumes" }),
    ];
    expect(rankedFoods(events).map((f) => f.item)).toEqual(["Rice", "Beans"]);
    expect(rankedFoods(events)[0].count).toBe(2);
  });
});

describe("foodVarietyOverTime", () => {
  it("returns an empty array for no food events", () => {
    expect(foodVarietyOverTime([])).toEqual([]);
  });

  it("counts unique foods per day and rolling 7d/30d windows", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Apple", date: "2026-01-01" }),
      makeEvent({ itemType: "food", item: "Pear", date: "2026-01-01" }),
      makeEvent({ itemType: "food", item: "Apple", date: "2026-01-02" }), // repeat, not new to the window
      makeEvent({ itemType: "food", item: "Banana", date: "2026-01-02" }),
    ];
    const points = foodVarietyOverTime(events);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({ date: "2026-01-01", uniqueFoodsThatDay: 2, rolling7dUniqueFoods: 2 });
    expect(points[1]).toMatchObject({ date: "2026-01-02", uniqueFoodsThatDay: 2, rolling7dUniqueFoods: 3 });
  });

  it("does not let a window bleed in a day outside its range", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Old", date: "2026-01-01" }),
      makeEvent({ itemType: "food", item: "New", date: "2026-01-20" }), // >7 days after the first
    ];
    const points = foodVarietyOverTime(events);
    const last = points[points.length - 1];
    expect(last.date).toBe("2026-01-20");
    expect(last.rolling7dUniqueFoods).toBe(1); // "Old" is outside the 7-day window by then
    expect(last.rolling30dUniqueFoods).toBe(2); // still inside the 30-day window
  });
});

describe("newFoodsOverTime", () => {

  it("keeps only the first-seen date per food, ordered by that date ascending", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Apple", category: "Fruit", date: "2026-01-05" }),
      makeEvent({ itemType: "food", item: "Apple", category: "Fruit", date: "2026-01-01" }), // earlier — should win
      makeEvent({ itemType: "food", item: "Pear", category: "Fruit", date: "2026-01-03" }),
    ];
    const result = newFoodsOverTime(events);
    expect(result).toEqual([
      { item: "Apple", category: "Fruit", firstSeenDate: "2026-01-01" },
      { item: "Pear", category: "Fruit", firstSeenDate: "2026-01-03" },
    ]);
  });
});

describe("mealInstances", () => {
  it("returns an empty array when nothing has a meal tag", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple", mealTag: null })];
    expect(mealInstances(events)).toEqual([]);
  });

  it("groups items by (date, mealTag), deduping repeated items within the same meal", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-01-01", mealTag: "Breakfast" }),
      makeEvent({ itemType: "food", item: "Toast", date: "2026-01-01", mealTag: "Breakfast" }),
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-01-01", mealTag: "Breakfast" }), // dup tap
      makeEvent({ itemType: "food", item: "Rice", date: "2026-01-01", mealTag: "Dinner" }),
    ];
    const instances = mealInstances(events);
    expect(instances).toHaveLength(2);
    const breakfast = instances.find((i) => i.mealTag === "Breakfast")!;
    expect(breakfast.items.sort()).toEqual(["Eggs", "Toast"]);
  });
});

describe("favoriteCombosByMeal", () => {
  it("returns an empty array when no combo repeats", () => {
    const instances = [{ date: "2026-01-01", mealTag: "Breakfast", items: ["Eggs", "Toast"] }];
    expect(favoriteCombosByMeal(instances)).toEqual([]);
  });

  it("excludes single-item instances (needs at least 2 ingredients)", () => {
    const instances = [
      { date: "2026-01-01", mealTag: "Snack", items: ["Apple"] },
      { date: "2026-01-02", mealTag: "Snack", items: ["Apple"] },
    ];
    expect(favoriteCombosByMeal(instances)).toEqual([]);
  });

  it("counts an exact repeated item set (order-independent) as one recurring combo", () => {
    const instances = [
      { date: "2026-01-01", mealTag: "Breakfast", items: ["Eggs", "Toast"] },
      { date: "2026-01-02", mealTag: "Breakfast", items: ["Toast", "Eggs"] }, // same set, different order
    ];
    const combos = favoriteCombosByMeal(instances, 2);
    expect(combos).toHaveLength(1);
    expect(combos[0]).toMatchObject({ mealTag: "Breakfast", items: ["Eggs", "Toast"], count: 2 });
  });

  it("does not merge two different item sets that happen to share items", () => {
    const instances = [
      { date: "2026-01-01", mealTag: "Lunch", items: ["Rice", "Beans"] },
      { date: "2026-01-02", mealTag: "Lunch", items: ["Rice", "Chicken"] },
    ];
    expect(favoriteCombosByMeal(instances, 1)).toHaveLength(2);
  });

  it("respects a custom minCount threshold", () => {
    const instances = [
      { date: "2026-01-01", mealTag: "Lunch", items: ["Rice", "Beans"] },
      { date: "2026-01-02", mealTag: "Lunch", items: ["Rice", "Beans"] },
      { date: "2026-01-03", mealTag: "Lunch", items: ["Rice", "Beans"] },
    ];
    expect(favoriteCombosByMeal(instances, 5)).toEqual([]);
    expect(favoriteCombosByMeal(instances, 3)).toHaveLength(1);
  });
});

describe("ingredientRotation", () => {
  it("flags a staple — logged on a real share of days within the range", () => {
    const events = Array.from({ length: 8 }, (_, i) => makeEvent({ item: "Oats", date: inRangeDay(i + 1) })); // 8 of 10 days
    const { staples } = ingredientRotation(events, RANGE);
    expect(staples).toEqual([{ item: "Oats", daysInRange: 8, rangeLengthDays: 10, percent: 80 }]);
  });

  it("excludes an item below the staple threshold", () => {
    const events = Array.from({ length: 2 }, (_, i) => makeEvent({ item: "Truffle", date: inRangeDay(i + 1) })); // 2 of 10 days = 20%
    expect(ingredientRotation(events, RANGE).staples).toEqual([]);
  });

  it("flags an item logged regularly before the range but not within it", () => {
    const events = Array.from({ length: 5 }, (_, i) => makeEvent({ item: "Rice", date: beforeRangeDay(22 + i) })); // 22..26 Jan
    const { fallenOutOfRotation } = ingredientRotation(events, RANGE);
    expect(fallenOutOfRotation).toEqual([{ item: "Rice", daysBefore: 5, daysInRange: 0 }]);
  });

  it("does not flag an item still logged regularly within the range, even if also logged before", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) => makeEvent({ item: "Chicken", date: beforeRangeDay(22 + i) })),
      ...Array.from({ length: 5 }, (_, i) => makeEvent({ item: "Chicken", date: inRangeDay(i + 1) })),
    ];
    expect(ingredientRotation(events, RANGE).fallenOutOfRotation).toEqual([]);
  });

  it("returns no fallen-out-of-rotation items when history doesn't extend back a full comparison window", () => {
    // Only 4 days of history before the range — short of the full 10-day
    // comparison window this 10-day range needs.
    const events = ["2026-01-28", "2026-01-29", "2026-01-30", "2026-01-31"].map((date) => makeEvent({ item: "Rice", date }));
    expect(ingredientRotation(events, RANGE).fallenOutOfRotation).toEqual([]);
  });

  it("caps both lists to topN, strongest first", () => {
    const events = ["A", "B", "C"].flatMap((item, idx) =>
      // A: 10/10 days, B: 9/10, C: 8/10 — all comfortably above the staple threshold.
      Array.from({ length: 10 - idx }, (_, i) => makeEvent({ item, date: inRangeDay(i + 1) })),
    );
    const { staples } = ingredientRotation(events, RANGE, 2);
    expect(staples.map((s) => s.item)).toEqual(["A", "B"]);
  });
});
