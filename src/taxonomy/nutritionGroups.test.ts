import { describe, expect, it } from "vitest";
import { NUTRITION_GROUP_EXAMPLES, NUTRITION_GROUPS, nutritionGroupsForFood } from "./nutritionGroups";

describe("nutritionGroupsForFood", () => {
  it("places a plain vegetable in other_vegetables", () => {
    expect(nutritionGroupsForFood("Carrot")).toEqual(["other_vegetables"]);
    expect(nutritionGroupsForFood("Tomato")).toEqual(["other_vegetables"]);
  });

  it("keeps white potato out of every group — starchy, not a vegetable serving", () => {
    expect(nutritionGroupsForFood("Potato")).toEqual([]);
    expect(nutritionGroupsForFood("Potatoes")).toEqual([]);
    expect(nutritionGroupsForFood("Mashed potato")).toEqual([]);
  });

  it("still counts sweet potato as a vegetable", () => {
    expect(nutritionGroupsForFood("Sweet potato")).toEqual(["other_vegetables"]);
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
