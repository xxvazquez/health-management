import { describe, expect, it } from "vitest";
import { buildCanonicalEvents } from "./buildCanonicalEvents";
import { makeDiaryEntry, makeItem, makeLog } from "@/lib/testFixtures";

describe("buildCanonicalEvents", () => {
  it("returns an empty array for empty input", () => {
    expect(buildCanonicalEvents([], [], [])).toEqual([]);
  });

  it("joins a log to its item, carrying item name/type/category/archive state onto the event", () => {
    const item = makeItem({ identity: "i1", rawName: "Apple", itemType: "food", category: "Fruit", isArchived: false });
    const log = makeLog({ identity: "l1", itemIdentity: "i1", date: "2026-02-01", value: 2, mealTag: "Lunch" });

    const events = buildCanonicalEvents([item], [log], []);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "l1",
      date: "2026-02-01",
      item: "Apple",
      itemType: "food",
      category: "Fruit",
      value: 2,
      completed: true,
      isArchived: false,
      source: "item-log",
      itemIdentity: "i1",
      mealTag: "Lunch",
    });
  });

  it("drops a log whose item can't be found (defensive — composite FK should prevent this in practice)", () => {
    const events = buildCanonicalEvents([], [makeLog({ itemIdentity: "missing" })], []);
    expect(events).toEqual([]);
  });

  it("marks completed=false for a zero-value log and completed=true for any positive value", () => {
    const item = makeItem({ identity: "i1" });
    const events = buildCanonicalEvents(
      [item],
      [
        makeLog({ itemIdentity: "i1", value: 0 }),
        makeLog({ itemIdentity: "i1", value: 1 }),
        makeLog({ itemIdentity: "i1", value: 45 }),
      ],
      [],
    );
    expect(events.map((e) => e.completed)).toEqual([false, true, true]);
  });

  it("treats a null value as not completed", () => {
    const item = makeItem({ identity: "i1" });
    const events = buildCanonicalEvents([item], [makeLog({ itemIdentity: "i1", value: null })], []);
    expect(events[0].completed).toBe(false);
    expect(events[0].value).toBeNull();
  });

  it("carries isArchived from the item, not from the log", () => {
    const item = makeItem({ identity: "i1", isArchived: true });
    const events = buildCanonicalEvents([item], [makeLog({ itemIdentity: "i1" })], []);
    expect(events[0].isArchived).toBe(true);
  });

  it("still produces an event for an archived item's historical logs — archiving must never hide history", () => {
    const item = makeItem({ identity: "i1", isArchived: true });
    const logs = [makeLog({ itemIdentity: "i1", date: "2026-01-01" }), makeLog({ itemIdentity: "i1", date: "2026-01-02" })];
    const events = buildCanonicalEvents([item], logs, []);
    expect(events).toHaveLength(2);
  });

  it("keeps duplicate logs for the same item on the same day as separate events (no implicit dedup/merge)", () => {
    const item = makeItem({ identity: "i1" });
    const logs = [
      makeLog({ identity: "l1", itemIdentity: "i1", date: "2026-01-01" }),
      makeLog({ identity: "l2", itemIdentity: "i1", date: "2026-01-01" }),
    ];
    const events = buildCanonicalEvents([item], logs, []);
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.id)).toEqual(["l1", "l2"]);
  });

  it("attaches a diary note matching the same item+date, and omits note when none exists", () => {
    const item = makeItem({ identity: "i1" });
    const logs = [
      makeLog({ itemIdentity: "i1", date: "2026-01-01" }),
      makeLog({ itemIdentity: "i1", date: "2026-01-02" }),
    ];
    const diary = [makeDiaryEntry({ itemIdentity: "i1", date: "2026-01-01", content: "felt bloated" })];
    const events = buildCanonicalEvents([item], logs, diary);
    expect(events.find((e) => e.date === "2026-01-01")?.note).toBe("felt bloated");
    expect(events.find((e) => e.date === "2026-01-02")?.note).toBeNull();
  });

  it("joins multiple same-day diary entries for one item with a separator instead of picking just one", () => {
    const item = makeItem({ identity: "i1" });
    const logs = [makeLog({ itemIdentity: "i1", date: "2026-01-01" })];
    const diary = [
      makeDiaryEntry({ itemIdentity: "i1", date: "2026-01-01", content: "note one" }),
      makeDiaryEntry({ itemIdentity: "i1", date: "2026-01-01", content: "note two" }),
    ];
    const events = buildCanonicalEvents([item], logs, diary);
    expect(events[0].note).toBe("note one | note two");
  });

  it("ignores a diary entry with empty/null content", () => {
    const item = makeItem({ identity: "i1" });
    const logs = [makeLog({ itemIdentity: "i1", date: "2026-01-01" })];
    const diary = [makeDiaryEntry({ itemIdentity: "i1", date: "2026-01-01", content: null })];
    const events = buildCanonicalEvents([item], logs, diary);
    expect(events[0].note).toBeNull();
  });

  it("doesn't leak a diary note across different items or different dates", () => {
    const items = [makeItem({ identity: "i1" }), makeItem({ identity: "i2" })];
    const logs = [
      makeLog({ itemIdentity: "i1", date: "2026-01-01" }),
      makeLog({ itemIdentity: "i2", date: "2026-01-01" }),
      makeLog({ itemIdentity: "i1", date: "2026-01-02" }),
    ];
    const diary = [makeDiaryEntry({ itemIdentity: "i1", date: "2026-01-01", content: "only for i1 on the 1st" })];
    const events = buildCanonicalEvents(items, logs, diary);
    const withNote = events.filter((e) => e.note != null);
    expect(withNote).toHaveLength(1);
    expect(withNote[0]).toMatchObject({ itemIdentity: "i1", date: "2026-01-01" });
  });

  it("passes mealTag through untouched, including null for non-food types", () => {
    const item = makeItem({ identity: "i1", itemType: "supplement" });
    const events = buildCanonicalEvents([item], [makeLog({ itemIdentity: "i1", itemType: "supplement", mealTag: null })], []);
    expect(events[0].mealTag).toBeNull();
  });
});
