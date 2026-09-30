import { describe, expect, it } from "vitest";
import { niceScale } from "./LabMarkerChart";

describe("niceScale", () => {
  it("fits small markers at their own magnitude", () => {
    const s = niceScale(0, 0.12);
    expect(s.ceil).toBeLessThanOrEqual(0.2);
    expect(s.floor).toBe(0);
    expect(s.ticks.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps a sensible range for large values and never goes below zero", () => {
    const s = niceScale(3.65, 5.07);
    expect(s.floor).toBeGreaterThanOrEqual(3);
    expect(s.ceil).toBeLessThanOrEqual(5.5);
    const big = niceScale(120, 180);
    expect(big.floor).toBeGreaterThanOrEqual(100);
    expect(big.ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it("returns ticks within the domain, evenly spaced", () => {
    const s = niceScale(0.05, 0.5);
    expect(s.ticks[0]).toBe(s.floor);
    expect(s.ticks.at(-1)).toBe(s.ceil);
  });
});
