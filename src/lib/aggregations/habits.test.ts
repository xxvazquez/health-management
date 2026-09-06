import { describe, expect, it } from "vitest";
import { habitStats, habitStatsRanked } from "./habits";
import { makeEvent } from "@/lib/testFixtures";

describe("habitStats", () => {
  it("only includes habit-type events", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple" }), makeEvent({ itemType: "habit", item: "Stretch" })];
    const stats = habitStats(events);
    expect(stats).toHaveLength(1);
    expect(stats[0].item).toBe("Stretch");
  });
});

describe("habitStatsRanked", () => {
  it("returns one flat list of habits, not grouped by category", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Nap", category: "Daily" }),
      makeEvent({ itemType: "habit", item: "Walk", category: "Body" }),
      makeEvent({ itemType: "food", item: "Apple", category: "Fruit" }),
    ];
    const ranked = habitStatsRanked(events);
    expect(ranked.map((r) => r.item).sort()).toEqual(["Nap", "Walk"]);
    expect(ranked.every((r) => "shiftPp" in r)).toBe(true);
  });

  it("leaves shiftPp null without enough recent history and falls back to consistency order", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Rare", category: "Daily", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "habit", item: "Often", category: "Daily", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "habit", item: "Often", category: "Daily", date: "2026-01-02", completed: true }),
    ];
    const ranked = habitStatsRanked(events);
    expect(ranked.every((r) => r.shiftPp === null)).toBe(true);
    expect(ranked[0].item).toBe("Often");
  });
});
