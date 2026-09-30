import { describe, expect, it } from "vitest";
import { DIET_DEFAULTS, extraFoodTargets, resolveAllFoodTargets, resolveFoodTargets } from "./foodTargets";

describe("resolveFoodTargets", () => {
  it("uses the everything defaults when nothing is saved", () => {
    expect(resolveAllFoodTargets(undefined)).toEqual(DIET_DEFAULTS.everything);
    expect(resolveFoodTargets(undefined)).toEqual({ vegetables: 14, fruit: 14, legumes: 5, grains: 14, nuts_seeds: 7, fish: 2 });
  });

  it("turns off fish and meat for a vegetarian and raises legumes", () => {
    const all = resolveAllFoodTargets({ diet: "vegetarian" });
    expect(all.fish.mode).toBe("off");
    expect(all.meat.mode).toBe("off");
    expect(resolveFoodTargets({ diet: "vegetarian" }).legumes).toBe(7);
  });

  it("lays saved targets over the diet's defaults", () => {
    const all = resolveAllFoodTargets({ diet: "pescatarian", groups: { fish: { mode: "min", perWeek: 4 }, fruit: { mode: "off", perWeek: 7 }, poultry: { mode: "max", perWeek: 1 } } });
    expect(all.fish).toEqual({ mode: "min", perWeek: 4 });
    expect(all.fruit.mode).toBe("off");
    expect(all.poultry).toEqual({ mode: "max", perWeek: 1 });
    expect(all.vegetables).toEqual({ mode: "min", perWeek: 14 });
  });

  it("still reads the older numbers-only shape, 0 meaning off", () => {
    const t = resolveFoodTargets({ perWeek: { vegetables: 14, fruit: 0 } });
    expect(t.vegetables).toBe(14);
    expect(t.fruit).toBeNull();
  });

  it("ignores an unknown diet and clamps to four meals a day", () => {
    const t = resolveFoodTargets({ diet: "carnivore" as never, perWeek: { legumes: 99, grains: -2 } });
    expect(t.legumes).toBe(28);
    expect(t.grains).toBeNull();
    expect(t.fish).toBe(2);
  });

  it("measures limits and the non-core groups that are on as plain counts", () => {
    const extra = extraFoodTargets({ groups: { vegetables: { mode: "max", perWeek: 5 } } });
    expect(extra.map((e) => `${e.group}:${e.mode}`)).toEqual(["vegetables:max", "fats:min", "meat:max", "sweets:max"]);
    expect(resolveFoodTargets({ groups: { vegetables: { mode: "max", perWeek: 5 } } }).vegetables).toBeNull();
  });
});
