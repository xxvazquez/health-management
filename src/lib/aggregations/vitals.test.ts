import { describe, expect, it } from "vitest";
import { bpCategory } from "./vitals";

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

  it("flags low readings under 90/60", () => {
    expect(bpCategory(88, 62).id).toBe("low"); // systolic drives it
    expect(bpCategory(105, 58).id).toBe("low"); // diastolic drives it
    expect(bpCategory(124, 58).id).toBe("low"); // low wins over elevated
    expect(bpCategory(90, 60).id).toBe("normal");
    expect(bpCategory(145, 58).id).toBe("stage2"); // high still wins
  });
});
