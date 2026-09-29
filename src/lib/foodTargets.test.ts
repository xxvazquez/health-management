import { describe, expect, it } from "vitest";
import { DIET_DEFAULTS, resolveFoodTargets } from "./foodTargets";

describe("resolveFoodTargets", () => {
  it("uses the everything defaults when nothing is saved", () => {
    expect(resolveFoodTargets(undefined)).toEqual(DIET_DEFAULTS.everything);
  });

  it("turns off fish for a vegetarian and raises legumes and nuts", () => {
    const t = resolveFoodTargets({ diet: "vegetarian" });
    expect(t.fish).toBeNull();
    expect(t.legumes).toBe(5);
    expect(t.nuts_seeds).toBe(7);
  });

  it("lays saved per-group targets over the diet's defaults, 0 meaning off", () => {
    const t = resolveFoodTargets({ diet: "pescatarian", perWeek: { fish: 3, fruit: 0 } });
    expect(t.fish).toBe(3);
    expect(t.fruit).toBeNull();
    expect(t.vegetables).toBe(7);
  });

  it("ignores an unknown diet and clamps out-of-range values", () => {
    const t = resolveFoodTargets({ diet: "carnivore" as never, perWeek: { legumes: 99, grains: -2 } });
    expect(t.legumes).toBe(14);
    expect(t.grains).toBeNull();
    expect(t.fish).toBe(2);
  });
});
