import { describe, expect, it } from "vitest";
import { NUTRITION_GROUP_EXAMPLES, NUTRITION_GROUPS, isGarnishFood, nutritionGroupsForFood, plantFamilyForFood } from "./nutritionGroups";

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

  it("matches keywords only at the start of a word", () => {
    expect(nutritionGroupsForFood("Chamomille")).toEqual([]);
    expect(nutritionGroupsForFood("Ham sandwich")).toEqual(["processed_meat"]);
    expect(nutritionGroupsForFood("Rapeseed oil")).toEqual(["other_unsaturated_fat"]);
    expect(plantFamilyForFood("Pineapple")).toBeNull();
  });

  it("returns nothing for an item with no confident fit", () => {
    expect(nutritionGroupsForFood("Oregano")).toEqual([]);
    expect(nutritionGroupsForFood("Sparkling water")).toEqual([]);
  });

  it("lets an override correct an item the keyword lookup gets wrong or misses", () => {
    // "Carrot" would normally match red_orange_veg; the override replaces
    // that outright rather than adding to it.
    expect(nutritionGroupsForFood("Carrot", { carrot: "starchy_veg" })).toEqual(["starchy_veg"]);
    // "Oregano" has no keyword match at all — an override still applies.
    expect(nutritionGroupsForFood("Oregano", { oregano: "other_vegetables" })).toEqual(["other_vegetables"]);
  });

  it("falls through to the keyword lookup when no override matches", () => {
    expect(nutritionGroupsForFood("Carrot", { onion: "alliums" })).toEqual(["red_orange_veg"]);
  });

  it("matches an override by normalized name, ignoring case and whitespace", () => {
    expect(nutritionGroupsForFood("  Carrot  ", { carrot: "starchy_veg" })).toEqual(["starchy_veg"]);
  });
});

describe("NUTRITION_GROUP_EXAMPLES", () => {
  it("has a non-empty example string for every group", () => {
    for (const g of NUTRITION_GROUPS) {
      expect(NUTRITION_GROUP_EXAMPLES[g]).toBeTruthy();
    }
  });
});

describe("isGarnishFood", () => {
  it("treats a squeeze, a clove, juices and powders as garnishes", () => {
    for (const name of ["Lemon juice", "Lemon", "Garlic", "Garlic powder", "Apple juice", "Date powder", "Breadcrumbs", "Ginger"]) {
      expect(isGarnishFood(name), name).toBe(true);
    }
  });

  it("keeps real portions as servings", () => {
    for (const name of ["Onion", "Apple", "Wild garlic", "Garlic oil", "Bread", "Orange", "Dried potatoes"]) {
      expect(isGarnishFood(name), name).toBe(false);
    }
  });

  it("counts a garnish as a serving once the user picks its group", () => {
    expect(isGarnishFood("Lemon", { lemon: "citrus" })).toBe(false);
  });
});

describe("added sugar", () => {
  it("counts syrups and honey toward sweets", () => {
    expect(nutritionGroupsForFood("Maple syrup")).toEqual(["highly_processed"]);
    expect(nutritionGroupsForFood("Honey")).toEqual(["highly_processed"]);
    expect(nutritionGroupsForFood("Jamón serrano")).toEqual(["processed_meat"]);
    expect(nutritionGroupsForFood("Garlic oil")).toEqual(["other_unsaturated_fat"]);
  });
});
