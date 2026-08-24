import { describe, expect, it } from "vitest";
import { seasonalPicksForMonth, weeklyCategoryPriority } from "./seasonal";
import { makeEvent } from "@/lib/testFixtures";

describe("seasonalPicksForMonth", () => {
  it("returns every item for that month, with weeksSinceLastEaten=null when never logged", () => {
    const picks = seasonalPicksForMonth([], 1, "2026-01-15");
    expect(picks.length).toBeGreaterThan(0);
    expect(picks.every((p) => p.weeksSinceLastEaten === null)).toBe(true);
  });

  it("computes weeks since last eaten for a matched item, using normalized-name matching", () => {
    // January's list includes "Apple" (see seasonalProduce.ts).
    const events = [makeEvent({ itemType: "food", item: "  apple  ", date: "2026-01-01", completed: true })];
    const picks = seasonalPicksForMonth(events, 1, "2026-01-15");
    const apple = picks.find((p) => p.item === "Apple")!;
    expect(apple.weeksSinceLastEaten).toBe(2); // 14 days = 2 full weeks
  });

  it("ignores an incomplete (not-logged) event", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple", date: "2026-01-01", completed: false, value: 0 })];
    const picks = seasonalPicksForMonth(events, 1, "2026-01-15");
    expect(picks.find((p) => p.item === "Apple")!.weeksSinceLastEaten).toBeNull();
  });

  it("ignores a non-food event even if the name matches", () => {
    const events = [makeEvent({ itemType: "habit", item: "Apple", date: "2026-01-01", completed: true })];
    const picks = seasonalPicksForMonth(events, 1, "2026-01-15");
    expect(picks.find((p) => p.item === "Apple")!.weeksSinceLastEaten).toBeNull();
  });

  it("uses the most recent occurrence when eaten multiple times", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Apple", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "food", item: "Apple", date: "2026-01-10", completed: true }),
    ];
    const picks = seasonalPicksForMonth(events, 1, "2026-01-15");
    expect(picks.find((p) => p.item === "Apple")!.weeksSinceLastEaten).toBe(0); // 5 days ago
  });

  it("sorts most-neglected first: never-eaten before long-ago before recent", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple", date: "2026-01-14", completed: true })]; // eaten yesterday
    const picks = seasonalPicksForMonth(events, 1, "2026-01-15");
    const appleIndex = picks.findIndex((p) => p.item === "Apple");
    const neverEatenIndex = picks.findIndex((p) => p.weeksSinceLastEaten === null);
    expect(neverEatenIndex).toBeLessThan(appleIndex);
  });

  it("returns an empty array for a month with no configured produce", () => {
    expect(seasonalPicksForMonth([], 999, "2026-01-15")).toEqual([]);
  });
});

describe("weeklyCategoryPriority", () => {
  it("returns an empty array for no food events", () => {
    expect(weeklyCategoryPriority([], "2026-01-15")).toEqual([]);
  });

  it("zero-fills a category logged before the window but not during it", () => {
    const events = [makeEvent({ itemType: "food", category: "Fats", date: "2025-12-01", completed: true })];
    const stats = weeklyCategoryPriority(events, "2026-01-15");
    expect(stats).toEqual([{ category: "Fats", countThisWeek: 0 }]);
  });

  it("counts only events within the trailing 7-day window (inclusive)", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-09", completed: true }), // exactly 6 days before ref
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-08", completed: true }), // 7 days before ref — outside
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-15", completed: true }), // ref date itself
    ];
    const [stat] = weeklyCategoryPriority(events, "2026-01-15");
    expect(stat.countThisWeek).toBe(2);
  });

  it("sorts least-tracked category first", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Frequent", date: "2026-01-15", completed: true }),
      makeEvent({ itemType: "food", category: "Frequent", date: "2026-01-14", completed: true }),
      makeEvent({ itemType: "food", category: "Rare", date: "2026-01-15", completed: true }),
    ];
    const stats = weeklyCategoryPriority(events, "2026-01-15");
    expect(stats[0].category).toBe("Rare");
  });

  it("ignores non-food and incomplete events", () => {
    const events = [
      makeEvent({ itemType: "habit", category: "Fats", date: "2026-01-15", completed: true }),
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-15", completed: false, value: 0 }),
    ];
    expect(weeklyCategoryPriority(events, "2026-01-15")).toEqual([]);
  });

  it("never surfaces Meat, however rarely it's logged", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Meat", date: "2025-01-01", completed: true }), // logged once, long ago
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-15", completed: true }),
      makeEvent({ itemType: "food", category: "Fruit", date: "2026-01-14", completed: true }),
    ];
    const stats = weeklyCategoryPriority(events, "2026-01-15");
    expect(stats.some((s) => s.category === "Meat")).toBe(false);
    expect(stats[0].category).toBe("Fruit");
  });
});
