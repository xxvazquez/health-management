import { describe, expect, it } from "vitest";
import { supplementStats, supplementsInsight } from "./supplements";
import { makeEvent } from "@/lib/testFixtures";

describe("supplementStats", () => {
  it("only includes supplement-type events", () => {
    const events = [makeEvent({ itemType: "food" }), makeEvent({ itemType: "supplement", item: "Vitamin D" })];
    expect(supplementStats(events).map((s) => s.item)).toEqual(["Vitamin D"]);
  });
});

describe("supplementsInsight", () => {
  it("excludes Fiber-category supplements (tracked separately on Digestion)", () => {
    const events = [
      makeEvent({ itemType: "supplement", item: "Psyllium Husk", category: "Fiber", date: "2026-01-01", completed: true }),
    ];
    // With the only supplement event excluded, there's nothing to describe.
    expect(supplementsInsight(events).insufficientData).toBe(true);
  });
});
