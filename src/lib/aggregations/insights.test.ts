import { describe, expect, it } from "vitest";
import { buildPersonalChangeSummary, driftFor, summarizeDrift } from "./insights";
import type { ItemTrend } from "./itemStats";

function makeTrend(overrides: Partial<ItemTrend> = {}): ItemTrend {
  return {
    item: "Test",
    category: "Misc",
    overallConsistencyPct: 50,
    overallTrackedDays: 20,
    recentConsistencyPct: 50,
    recentTrackedDays: 10,
    ...overrides,
  };
}

describe("driftFor", () => {
  it("is insufficient-data when overall tracked days is below the baseline minimum (10)", () => {
    expect(driftFor(makeTrend({ overallTrackedDays: 5 }))).toBe("insufficient-data");
  });

  it("is insufficient-data when recent tracked days is below the minimum (5)", () => {
    expect(driftFor(makeTrend({ recentTrackedDays: 2 }))).toBe("insufficient-data");
  });

  it("is stable when recent is within 15pp of overall", () => {
    expect(driftFor(makeTrend({ overallConsistencyPct: 50, recentConsistencyPct: 60 }))).toBe("stable");
  });

  it("is increased when recent exceeds overall by at least 15pp", () => {
    expect(driftFor(makeTrend({ overallConsistencyPct: 50, recentConsistencyPct: 65 }))).toBe("increased");
  });

  it("is decreased when recent trails overall by at least 15pp", () => {
    expect(driftFor(makeTrend({ overallConsistencyPct: 50, recentConsistencyPct: 35 }))).toBe("decreased");
  });

  it("treats exactly the 15pp threshold as a change, not stable (boundary case)", () => {
    expect(driftFor(makeTrend({ overallConsistencyPct: 50, recentConsistencyPct: 65 }))).toBe("increased");
    expect(driftFor(makeTrend({ overallConsistencyPct: 50, recentConsistencyPct: 35 }))).toBe("decreased");
  });
});

describe("buildPersonalChangeSummary", () => {
  it("reports insufficientData for no trends", () => {
    const summary = buildPersonalChangeSummary([], "habit", "habits", "Done");
    expect(summary.insufficientData).toBe(true);
    expect(summary.detail).toBeNull();
  });

  it("reports insufficientData when every trend lacks enough history to judge", () => {
    const trends = [makeTrend({ overallTrackedDays: 2 })];
    const summary = buildPersonalChangeSummary(trends, "habit", "habits", "Done");
    expect(summary.insufficientData).toBe(true);
    expect(summary.detail).toContain("1 tracked habit");
  });

  it("headlines 'all running at usual pace' when nothing moved", () => {
    const trends = [makeTrend({ overallConsistencyPct: 80, recentConsistencyPct: 80 })];
    const summary = buildPersonalChangeSummary(trends, "habit", "habits", "Done");
    expect(summary.insufficientData).toBe(false);
    expect(summary.headline).toContain("usual pace");
    expect(summary.changed).toEqual([]);
  });

  it("lists a moved item with a concrete recent-vs-usual comparison, sorted by magnitude", () => {
    const trends = [
      makeTrend({ item: "Big mover", overallConsistencyPct: 20, recentConsistencyPct: 80 }),
      makeTrend({ item: "Small mover", overallConsistencyPct: 50, recentConsistencyPct: 68 }),
    ];
    const summary = buildPersonalChangeSummary(trends, "habit", "habits", "Done");
    expect(summary.changed[0].label).toBe("Big mover");
    expect(summary.changed[0].detail).toContain("80%");
    expect(summary.changed[0].detail).toContain("20%");
  });

  it("caps the changed list at 4 items", () => {
    const trends = Array.from({ length: 6 }, (_, i) =>
      makeTrend({ item: `Item ${i}`, overallConsistencyPct: 10, recentConsistencyPct: 90 }),
    );
    const summary = buildPersonalChangeSummary(trends, "habit", "habits", "Done");
    expect(summary.changed).toHaveLength(4);
  });

  it("notes items excluded from judgment (not enough history) in the detail line", () => {
    const trends = [
      makeTrend({ item: "Judgeable", overallConsistencyPct: 80, recentConsistencyPct: 80 }),
      makeTrend({ item: "Too new", overallTrackedDays: 2 }),
    ];
    const summary = buildPersonalChangeSummary(trends, "habit", "habits", "Done");
    expect(summary.detail).toContain("1 more tracked habit");
  });
});

describe("summarizeDrift", () => {
  it("returns zeroed counts and null average for no trends", () => {
    expect(summarizeDrift([])).toEqual({ trackedCount: 0, avgConsistencyPct: null, increasedCount: 0, decreasedCount: 0 });
  });

  it("counts increased/decreased independently and averages overall consistency across all trends", () => {
    const trends = [
      makeTrend({ overallConsistencyPct: 40, recentConsistencyPct: 80 }), // increased
      makeTrend({ overallConsistencyPct: 80, recentConsistencyPct: 40 }), // decreased
      makeTrend({ overallConsistencyPct: 60, recentConsistencyPct: 60 }), // stable
    ];
    const summary = summarizeDrift(trends);
    expect(summary.trackedCount).toBe(3);
    expect(summary.increasedCount).toBe(1);
    expect(summary.decreasedCount).toBe(1);
    expect(summary.avgConsistencyPct).toBe(60); // (40+80+60)/3
  });
});
