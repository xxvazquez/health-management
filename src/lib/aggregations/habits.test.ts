import { describe, expect, it } from "vitest";
import { habitStats, habitsAtAGlance, habitsByCategory, habitsInsight } from "./habits";
import { makeEvent } from "@/lib/testFixtures";

describe("habitStats", () => {
  it("only includes habit-type events", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple" }), makeEvent({ itemType: "habit", item: "Stretch" })];
    const stats = habitStats(events);
    expect(stats).toHaveLength(1);
    expect(stats[0].item).toBe("Stretch");
  });

  it("returns an empty array for no events", () => {
    expect(habitStats([])).toEqual([]);
  });
});

describe("habitsByCategory", () => {
  it("returns an empty array for no habit events", () => {
    expect(habitsByCategory([])).toEqual([]);
  });

  it("keeps a known category's curated position and appends an unknown custom category alphabetically after", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Nap", category: "Sleep" }),
      makeEvent({ itemType: "habit", item: "Journaling", category: "Mindset" }), // not in HABIT_CATEGORIES
    ];
    const groups = habitsByCategory(events);
    expect(groups.map((g) => g.category)).toEqual(["Sleep", "Mindset"]);
  });

  it("groups items under their own category, not leaking into another", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Nap", category: "Sleep" }),
      makeEvent({ itemType: "habit", item: "Walk", category: "Movement" }),
    ];
    const groups = habitsByCategory(events);
    const sleep = groups.find((g) => g.category === "Sleep")!;
    expect(sleep.items.map((i) => i.item)).toEqual(["Nap"]);
  });
});

describe("habitsInsight / habitsAtAGlance", () => {
  it("don't throw for no events, and describe/summarize an empty trend set", () => {
    expect(() => habitsInsight([])).not.toThrow();
    const glance = habitsAtAGlance([]);
    expect(glance).toBeDefined();
  });
});
