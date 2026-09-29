import { describe, expect, it } from "vitest";
import { lookupFoodCategory } from "./classify";
import { CATEGORIES_BY_TYPE } from "./categories";

const food = CATEGORIES_BY_TYPE.food;

describe("lookupFoodCategory", () => {
  it("files fresh herbs under Herbs and dried ones under Spices", () => {
    expect(lookupFoodCategory("Parsley", food)).toBe("Herbs");
    expect(lookupFoodCategory("Chives", food)).toBe("Herbs");
    expect(lookupFoodCategory("Dried parsley", food)).toBe("Spices");
    expect(lookupFoodCategory("Parsley root", food)).toBe("Veggies");
  });

  it("never guesses a category the user doesn't have", () => {
    expect(lookupFoodCategory("Dill", food.filter((c) => c !== "Herbs"))).toBeNull();
  });
});
