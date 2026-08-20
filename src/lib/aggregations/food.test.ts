import { describe, expect, it } from "vitest";
import { favoriteCombosByMeal, foodCategoryDistribution, foodVarietyOverTime, mealInstances, newFoodsOverTime, rankedFoods } from "./food";
import { makeEvent } from "@/lib/testFixtures";

describe("foodCategoryDistribution", () => {
  it("returns an empty array for no events", () => {
    expect(foodCategoryDistribution([])).toEqual([]);
  });

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

  it("respects a user-renamed/custom category name — no assumption of a fixed category set", () => {
    const events = [makeEvent({ itemType: "food", category: "Fermented", item: "Kimchi" })];
    expect(foodCategoryDistribution(events)).toEqual([{ category: "Fermented", count: 1, uniqueFoods: 1, sharePct: 100 }]);
  });
});

describe("rankedFoods", () => {
  it("returns an empty array for no food events", () => {
    expect(rankedFoods([])).toEqual([]);
  });

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
  it("returns an empty array for no food events", () => {
    expect(newFoodsOverTime([])).toEqual([]);
  });

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
