import { describe, expect, it } from "vitest";
import { DIET_DEFAULTS, extraFoodTargets, resolveAllFoodTargets, resolveFoodTargets } from "./foodTargets";

describe("resolveFoodTargets", () => {
  it("uses the everything defaults when nothing is saved", () => {
    expect(resolveAllFoodTargets(undefined)).toEqual(DIET_DEFAULTS.everything);
    expect(resolveFoodTargets(undefined)).toEqual({ vegetables: 7, fruit: 7, legumes: 3, grains: 7, nuts_seeds: 5, fish: 2 });
  });

  it("turns off fish and meat for a vegetarian and raises legumes and nuts", () => {
    const all = resolveAllFoodTargets({ diet: "vegetarian" });
    expect(all.fish.mode).toBe("off");
    expect(all.meat.mode).toBe("off");
    const t = resolveFoodTargets({ diet: "vegetarian" });
    expect(t.legumes).toBe(5);
    expect(t.nuts_seeds).toBe(7);
  });

  it("lays saved targets over the diet's defaults", () => {
    const all = resolveAllFoodTargets({ diet: "pescatarian", groups: { fish: { mode: "min", perWeek: 3 }, fruit: { mode: "off", perWeek: 7 }, meat: { mode: "max", perWeek: 1 } } });
    expect(all.fish).toEqual({ mode: "min", perWeek: 3 });
    expect(all.fruit.mode).toBe("off");
    expect(all.meat).toEqual({ mode: "max", perWeek: 1 });
    expect(all.vegetables).toEqual({ mode: "min", perWeek: 7 });
  });

  it("still reads the older numbers-only shape, 0 meaning off", () => {
    const t = resolveFoodTargets({ perWeek: { fish: 3, fruit: 0 } });
    expect(t.fish).toBe(3);
    expect(t.fruit).toBeNull();
  });

  it("ignores an unknown diet and clamps to at most 7 days", () => {
    const t = resolveFoodTargets({ diet: "carnivore" as never, perWeek: { legumes: 99, grains: -2 } });
    expect(t.legumes).toBe(7);
    expect(t.grains).toBeNull();
    expect(t.fish).toBe(2);
  });

  it("measures meat and sweets as limits, and a core group set as a limit", () => {
    const extra = extraFoodTargets({ groups: { vegetables: { mode: "max", perWeek: 5 } } });
    expect(extra.map((e) => `${e.group}:${e.mode}`)).toEqual(["vegetables:max", "meat:max", "sweets:max"]);
    expect(resolveFoodTargets({ groups: { vegetables: { mode: "max", perWeek: 5 } } }).vegetables).toBeNull();
  });
});
