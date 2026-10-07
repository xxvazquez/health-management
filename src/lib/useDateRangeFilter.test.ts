import { describe, expect, it } from "vitest";
import { rangeChoiceFrom, resolveRangeChoice } from "./useDateRangeFilter";

const span = { start: "2026-01-01", end: "2026-10-07" };

describe("range choice", () => {
  it("keeps a window ending at the newest entry rolling", () => {
    const choice = rangeChoiceFrom({ start: "2026-09-08", end: "2026-10-07" }, span);
    expect(choice).toEqual({ days: 30 });
    // Two weeks of new data later it still covers the last 30 days.
    expect(resolveRangeChoice(choice, { start: "2026-01-01", end: "2026-10-21" })).toEqual({ start: "2026-09-22", end: "2026-10-21" });
  });

  it("resolves the same window against another dashboard's own span", () => {
    expect(resolveRangeChoice({ days: 30 }, { start: "2026-03-01", end: "2026-10-02" })).toEqual({ start: "2026-09-03", end: "2026-10-02" });
  });

  it("treats the whole span as all time", () => {
    const choice = rangeChoiceFrom(span, span);
    expect(choice).toEqual({ all: true });
    expect(resolveRangeChoice(choice, { start: "2026-01-01", end: "2026-11-01" })).toEqual({ start: "2026-01-01", end: "2026-11-01" });
  });

  it("keeps a custom span fixed and clamps it into the data", () => {
    const choice = rangeChoiceFrom({ start: "2026-03-01", end: "2026-03-31" }, span);
    expect(choice).toEqual({ start: "2026-03-01", end: "2026-03-31" });
    expect(resolveRangeChoice(choice, { start: "2026-03-10", end: "2026-10-07" })).toEqual({ start: "2026-03-10", end: "2026-03-31" });
    expect(resolveRangeChoice(choice, { start: "2026-05-01", end: "2026-10-07" })).toBeNull();
  });
});
