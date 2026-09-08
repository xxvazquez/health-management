import { describe, expect, it } from "vitest";
import { supplementStats } from "./supplements";
import { makeEvent } from "@/lib/testFixtures";

describe("supplementStats", () => {
  it("only includes supplement-type events", () => {
    const events = [makeEvent({ itemType: "food" }), makeEvent({ itemType: "supplement", item: "Vitamin D" })];
    expect(supplementStats(events).map((s) => s.item)).toEqual(["Vitamin D"]);
  });
});
