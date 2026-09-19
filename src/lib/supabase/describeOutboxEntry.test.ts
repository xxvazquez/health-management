import { describe, expect, it } from "vitest";
import { describeOutboxEntry, formatSavedAt } from "./describeOutboxEntry";
import type { OutboxEntry } from "@/lib/db/indexedDb";

function entry(overrides: Partial<OutboxEntry>): OutboxEntry {
  return {
    id: "e1",
    userId: "u",
    dedupeKey: "k:1",
    table: "food_logs",
    op: "upsert",
    payload: {},
    attempts: 0,
    createdAt: 0,
    nextAttemptAt: 0,
    status: "pending",
    ...overrides,
  };
}

describe("describeOutboxEntry", () => {
  it("names a log by its item, with the day and meal", () => {
    const d = describeOutboxEntry(
      entry({ payload: { id: "l1", item_id: "i1", date: "2026-09-19", meal_tag: "Lunch" } }),
      new Map([["i1", "Eggs"]]),
    );
    expect(d).toEqual({ title: "Eggs", kind: "Food log", details: ["2026-09-19", "Lunch"] });
  });

  it("uses the name an item upsert carries", () => {
    expect(describeOutboxEntry(entry({ table: "habit_items", payload: { id: "h", name: "Stretch" } }), new Map()).title).toBe("Stretch");
  });

  it("marks a delete and doesn't invent a name", () => {
    const d = describeOutboxEntry(entry({ op: "delete", payload: { id: "l1" } }), new Map());
    expect(d).toMatchObject({ kind: "Deleted food log", title: "An entry you removed" });
  });

  it("shows the weight for a workout entry", () => {
    const d = describeOutboxEntry(entry({ table: "workout_logs", payload: { id: "w", item_id: "i", date: "2026-09-19", weight_kg: 40 } }), new Map([["i", "Squat"]]));
    expect(d).toMatchObject({ title: "Squat", details: ["2026-09-19", "40 kg"] });
  });
});

describe("formatSavedAt", () => {
  it("gives the day and the time", () => {
    expect(formatSavedAt(new Date(2026, 8, 19, 14, 32).getTime())).toMatch(/^19 Sept?, 14:32$/);
  });
});
