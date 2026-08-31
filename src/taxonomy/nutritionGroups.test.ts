import { describe, expect, it } from "vitest";
import { NUTRITION_GROUP_EXAMPLES, NUTRITION_GROUPS, nutritionGroupsForFood } from "./nutritionGroups";

describe("nutritionGroupsForFood", () => {
  it("splits vegetables into research-backed subgroups", () => {
    expect(nutritionGroupsForFood("Carrot")).toEqual(["red_orange_veg"]);
    expect(nutritionGroupsForFood("Tomato")).toEqual(["red_orange_veg"]);
    expect(nutritionGroupsForFood("Sweet potato")).toEqual(["red_orange_veg"]);
    expect(nutritionGroupsForFood("Onion")).toEqual(["alliums"]);
    expect(nutritionGroupsForFood("Garlic")).toEqual(["alliums"]);
    expect(nutritionGroupsForFood("Cucumber")).toEqual(["other_vegetables"]);
    expect(nutritionGroupsForFood("Mushroom")).toEqual(["other_vegetables"]);
  });

  it("splits citrus off from other fruit", () => {
    expect(nutritionGroupsForFood("Orange")).toEqual(["citrus"]);
    expect(nutritionGroupsForFood("Grapefruit")).toEqual(["citrus"]);
    expect(nutritionGroupsForFood("Apple")).toEqual(["other_fruit"]);
  });

  it("puts starchy roots in their own group, not with vegetables for health", () => {
    expect(nutritionGroupsForFood("Potato")).toEqual(["starchy_veg"]);
    expect(nutritionGroupsForFood("Potatoes")).toEqual(["starchy_veg"]);
    expect(nutritionGroupsForFood("Mashed potato")).toEqual(["starchy_veg"]);
    expect(nutritionGroupsForFood("Plantain")).toEqual(["starchy_veg"]);
  });

  it("does not treat plant milks as dairy", () => {
    expect(nutritionGroupsForFood("Oat milk")).toEqual([]);
    expect(nutritionGroupsForFood("Almond milk")).toEqual([]);
    expect(nutritionGroupsForFood("Milk")).toEqual(["dairy_other"]);
  });

  it("matches the longest keyword first", () => {
    expect(nutritionGroupsForFood("Brown rice")).toEqual(["whole_grains"]);
    expect(nutritionGroupsForFood("White rice")).toEqual(["refined_grains"]);
  });

  it("tags a food that genuinely serves two roles", () => {
    expect(nutritionGroupsForFood("Avocado")).toEqual(["other_fruit", "other_unsaturated_fat"]);
  });

  it("returns nothing for an item with no confident fit", () => {
    expect(nutritionGroupsForFood("Oregano")).toEqual([]);
    expect(nutritionGroupsForFood("Sparkling water")).toEqual([]);
  });
});

describe("NUTRITION_GROUP_EXAMPLES", () => {
  it("has a non-empty example string for every group", () => {
    for (const g of NUTRITION_GROUPS) {
      expect(NUTRITION_GROUP_EXAMPLES[g]).toBeTruthy();
    }
  });
});
