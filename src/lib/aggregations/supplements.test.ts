import { describe, expect, it } from "vitest";
import { supplementStats, supplementStatsRanked, supplementsAtAGlance } from "./supplements";
import { makeEvent } from "@/lib/testFixtures";

describe("supplementStats", () => {
  it("only includes supplement-type events", () => {
    const events = [makeEvent({ itemType: "food" }), makeEvent({ itemType: "supplement", item: "Vitamin D" })];
    expect(supplementStats(events).map((s) => s.item)).toEqual(["Vitamin D"]);
  });
});

describe("supplementStatsRanked", () => {
  it("returns one flat list and leaves Fiber out", () => {
    const events = [
      makeEvent({ itemType: "supplement", item: "Fish Oil", category: "Omega" }),
      makeEvent({ itemType: "supplement", item: "Psyllium", category: "Fiber" }),
    ];
    expect(supplementStatsRanked(events).map((s) => s.item)).toEqual(["Fish Oil"]);
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
