import { describe, expect, it } from "vitest";
import { bpCategory, bpElevated, netChange } from "./vitals";

describe("bpCategory", () => {
  it("classifies by ACC/AHA thresholds", () => {
    expect(bpCategory(115, 75).id).toBe("normal");
    expect(bpCategory(122, 76).id).toBe("elevated");
    expect(bpCategory(134, 78).id).toBe("stage1");
    expect(bpCategory(118, 82).id).toBe("stage1"); // diastolic drives it
    expect(bpCategory(145, 88).id).toBe("stage2");
    expect(bpCategory(120, 92).id).toBe("stage2"); // diastolic drives it
    expect(bpCategory(185, 100).id).toBe("crisis");
  });

  it("takes the higher of what systolic and diastolic each imply", () => {
    expect(bpCategory(150, 70).id).toBe("stage2");
    expect(bpCategory(110, 95).id).toBe("stage2");
  });
});

describe("bpElevated", () => {
  it("is true at stage 1 and above", () => {
    expect(bpElevated(118, 76)).toBe(false);
    expect(bpElevated(124, 78)).toBe(false);
    expect(bpElevated(132, 78)).toBe(true);
    expect(bpElevated(150, 95)).toBe(true);
  });
});

describe("netChange", () => {
  it("returns last minus first, or null under two points", () => {
    expect(netChange([{ date: "a", value: 68 }, { date: "b", value: 67 }, { date: "c", value: 66.5 }])).toBeCloseTo(-1.5);
    expect(netChange([{ date: "a", value: 68 }])).toBeNull();
  });
});
