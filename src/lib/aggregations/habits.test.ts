import { describe, expect, it } from "vitest";
import { habitStats } from "./habits";
import { makeEvent } from "@/lib/testFixtures";

describe("habitStats", () => {
  it("only includes habit-type events", () => {
    const events = [makeEvent({ itemType: "food", item: "Apple" }), makeEvent({ itemType: "habit", item: "Stretch" })];
    const stats = habitStats(events);
    expect(stats).toHaveLength(1);
    expect(stats[0].item).toBe("Stretch");
  });
});
