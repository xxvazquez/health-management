import { describe, expect, it } from "vitest";
import { computeItemStats, computeItemStatsForFilter, computeItemTrends } from "./itemStats";
import { makeEvent } from "@/lib/testFixtures";

describe("computeItemStats", () => {
  it("returns an empty array for no events", () => {
    expect(computeItemStats([], [])).toEqual([]);
  });

  it("computes tracked/completed counts and consistency for a single item", () => {
    const events = [
      makeEvent({ item: "Vitamin D", date: "2026-01-01", completed: true }),
      makeEvent({ item: "Vitamin D", date: "2026-01-02", completed: false, value: 0 }),
      makeEvent({ item: "Vitamin D", date: "2026-01-03", completed: true }),
    ];
    const activeDates = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const [stat] = computeItemStats(events, activeDates);

    expect(stat.item).toBe("Vitamin D");
    expect(stat.daysTracked).toBe(3);
    expect(stat.daysCompleted).toBe(2);
    expect(stat.consistencyPct).toBeCloseTo(66.7, 1);
    expect(stat.firstTrackedDate).toBe("2026-01-01");
    expect(stat.lastTrackedDate).toBe("2026-01-03");
  });

  it("only counts active dates from the item's first occurrence onward, not before", () => {
    const events = [makeEvent({ item: "Magnesium", date: "2026-01-10", completed: true })];
    // The app was used well before this item's first-ever log.
    const activeDates = ["2026-01-01", "2026-01-05", "2026-01-10", "2026-01-11"];
    const [stat] = computeItemStats(events, activeDates);
    expect(stat.daysTracked).toBe(2); // only 01-10 and 01-11
  });

  it("groups events by item name across different underlying identities, using the most recent for identity/archive state", () => {
    const events = [
      makeEvent({ item: "Coffee", date: "2026-01-01", itemIdentity: "old-id", isArchived: false }),
      makeEvent({ item: "Coffee", date: "2026-01-02", itemIdentity: "new-id", isArchived: true }),
    ];
    const [stat] = computeItemStats(events, ["2026-01-01", "2026-01-02"]);
    expect(stat.itemIdentity).toBe("new-id");
    expect(stat.isArchived).toBe(true);
  });

  it("computes an independent streak per item when multiple items are present", () => {
    const events = [
      makeEvent({ item: "A", date: "2026-01-01", completed: true }),
      makeEvent({ item: "A", date: "2026-01-02", completed: true }),
      makeEvent({ item: "B", date: "2026-01-01", completed: true }),
      makeEvent({ item: "B", date: "2026-01-02", completed: false, value: 0 }),
    ];
    const activeDates = ["2026-01-01", "2026-01-02"];
    const stats = computeItemStats(events, activeDates);
    const a = stats.find((s) => s.item === "A")!;
    const b = stats.find((s) => s.item === "B")!;
    expect(a.currentStreak).toBe(2);
    expect(b.currentStreak).toBe(0);
  });

  it("sorts by daysCompleted descending", () => {
    const events = [
      makeEvent({ item: "Rare", date: "2026-01-01", completed: true }),
      makeEvent({ item: "Frequent", date: "2026-01-01", completed: true }),
      makeEvent({ item: "Frequent", date: "2026-01-02", completed: true }),
    ];
    const stats = computeItemStats(events, ["2026-01-01", "2026-01-02"]);
    expect(stats.map((s) => s.item)).toEqual(["Frequent", "Rare"]);
  });

  it("handles an item tracked on only one day (no crash on a single-element date range)", () => {
    const events = [makeEvent({ item: "Once", date: "2026-01-01", completed: true })];
    const [stat] = computeItemStats(events, ["2026-01-01"]);
    expect(stat.daysTracked).toBe(1);
    expect(stat.currentStreak).toBe(1);
  });
});

describe("computeItemStatsForFilter", () => {
  it("computes stats only for events matching the predicate", () => {
    const events = [
      makeEvent({ item: "Food A", itemType: "food", date: "2026-01-01" }),
      makeEvent({ item: "Habit A", itemType: "habit", date: "2026-01-01" }),
      makeEvent({ item: "Habit A", itemType: "habit", date: "2026-01-02" }),
    ];
    const stats = computeItemStatsForFilter(events, (e) => e.itemType === "habit");
    expect(stats).toHaveLength(1);
    expect(stats[0].item).toBe("Habit A");
  });

  it("derives 'active dates' (the app-usage denominator) from the whole dataset, not just the filtered slice — a habit's consistency is judged against every day anything was tracked, not just days a habit itself was tracked", () => {
    const events = [
      makeEvent({ item: "Food A", itemType: "food", date: "2026-01-01" }),
      makeEvent({ item: "Food A", itemType: "food", date: "2026-01-02" }),
      // The habit only has a log on 01-01; 01-02 is a miss it should be
      // judged against, because the app itself was used that day (a food
      // entry exists), not excluded just because this filter's own item
      // wasn't logged.
      makeEvent({ item: "Habit A", itemType: "habit", date: "2026-01-01", completed: true }),
    ];
    const stats = computeItemStatsForFilter(events, (e) => e.itemType === "habit");
    expect(stats[0].daysTracked).toBe(2);
    expect(stats[0].daysCompleted).toBe(1);
  });

  it("returns an empty array when the predicate matches nothing", () => {
    const events = [makeEvent({ itemType: "food" })];
    expect(computeItemStatsForFilter(events, (e) => e.itemType === "habit")).toEqual([]);
  });
});

describe("computeItemTrends", () => {
  it("returns recentConsistencyPct=null with recentTrackedDays=0 for an empty active-dates list", () => {
    const events = [makeEvent({ item: "A", date: "2026-01-01", completed: true })];
    const [trend] = computeItemTrends(events, []);
    expect(trend.recentConsistencyPct).toBeNull();
    expect(trend.recentTrackedDays).toBe(0);
    expect(trend.overallTrackedDays).toBe(0);
  });

  it("splits overall vs recent (last 14 tracked days) consistency", () => {
    // 20 active dates; item completed only in the most recent 14.
    const activeDates = Array.from({ length: 20 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
    const events = activeDates.slice(6).map((d) => makeEvent({ item: "Streaky", date: d, completed: true }));
    const trends = computeItemTrends(events, activeDates);
    const trend = trends.find((t) => t.item === "Streaky")!;
    expect(trend.recentConsistencyPct).toBe(100);
    expect(trend.recentTrackedDays).toBe(14);
    expect(trend.overallTrackedDays).toBe(14); // item's own first-tracked-date onward
  });

  it("returns an empty array for no events regardless of active dates", () => {
    expect(computeItemTrends([], ["2026-01-01"])).toEqual([]);
  });
});
