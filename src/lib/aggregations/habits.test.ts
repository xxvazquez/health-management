import { describe, expect, it } from "vitest";
import { habitStats, habitsByCategory } from "./habits";
import { makeEvent } from "@/lib/testFixtures";

describe("habitStats", () => {
  it("only includes habit-type events", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple" }), makeEvent({ itemType: "habit", item: "Stretch" })];
    const stats = habitStats(events);
    expect(stats).toHaveLength(1);
    expect(stats[0].item).toBe("Stretch");
  });
});

describe("habitsByCategory", () => {
  it("keeps a known category's curated position and appends an unknown custom category alphabetically after", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Nap", category: "Daily" }),
      makeEvent({ itemType: "habit", item: "Journaling", category: "Mindset" }), // not in HABIT_CATEGORIES
    ];
    const groups = habitsByCategory(events);
    expect(groups.map((g) => g.category)).toEqual(["Daily", "Mindset"]);
  });

  it("groups items under their own category, not leaking into another", () => {
    const events = [
      makeEvent({ itemType: "habit", item: "Nap", category: "Daily" }),
      makeEvent({ itemType: "habit", item: "Walk", category: "Body" }),
    ];
    const groups = habitsByCategory(events);
    const daily = groups.find((g) => g.category === "Daily")!;
    expect(daily.items.map((i) => i.item)).toEqual(["Nap"]);
  });
});
