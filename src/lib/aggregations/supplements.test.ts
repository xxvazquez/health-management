import { describe, expect, it } from "vitest";
import { supplementStats, supplementsAtAGlance, supplementsByCategory } from "./supplements";
import { makeEvent } from "@/lib/testFixtures";

describe("supplementStats", () => {
  it("only includes supplement-type events", () => {
    const events = [makeEvent({ itemType: "food" }), makeEvent({ itemType: "supplement", item: "Vitamin D" })];
    expect(supplementStats(events).map((s) => s.item)).toEqual(["Vitamin D"]);
  });
});

describe("supplementsByCategory", () => {
  it("appends an unrecognized custom category alphabetically after the known ones", () => {
    const events = [
      makeEvent({ itemType: "supplement", item: "Custom Blend", category: "Zzz Custom" }),
      makeEvent({ itemType: "supplement", item: "Fish Oil", category: "Omega" }),
    ];
    const groups = supplementsByCategory(events);
    // Whatever the exact known-category order is, an unrecognized one always lands last.
    expect(groups[groups.length - 1].category).toBe("Zzz Custom");
  });
});

describe("supplementsAtAGlance", () => {
  it("excludes Fiber-category supplements from the trend summary (tracked separately on Digestion)", () => {
    const events = [
      makeEvent({ itemType: "supplement", item: "Psyllium Husk", category: "Fiber", date: "2026-01-01", completed: true }),
    ];
    const glance = supplementsAtAGlance(events);
    // With the only supplement event excluded, there's nothing to summarize.
    expect(glance.trackedCount).toBe(0);
  });
});
