import { afterEach, describe, expect, it, vi } from "vitest";
import { combineDateAndTime, dayTimelineEntries, decideChipTapAction, defaultLogTimeValue, loggedCountsForDate, toTimeInputValue, type LogCandidate } from "./logCandidates";
import type { RawItem, RawLog } from "@/lib/types";
import { createTimeOrderedId } from "@/lib/sortableId";

function makeCandidate(overrides: Partial<LogCandidate> = {}): LogCandidate {
  return { key: "item-1", item: "Apple", itemType: "food", category: "Fruit", itemIdentity: "item-1", count: 0, ...overrides };
}

function makeLog(overrides: Partial<RawLog> = {}): RawLog {
  return {
    identity: `log-${Math.random()}`,
    itemIdentity: "item-1",
    itemType: "supplement",
    date: "2026-01-01",
    value: 1,
    updatedAt: "2026-01-01T08:00:00.000Z",
    mealTag: null,
    ...overrides,
  };
}

describe("defaultLogTimeValue", () => {
  it("returns the current time from 03:00 onwards", () => {
    expect(defaultLogTimeValue(new Date(2026, 7, 29, 9, 15))).toBe("09:15");
    expect(defaultLogTimeValue(new Date(2026, 7, 29, 22, 5))).toBe("22:05");
  });

  it("returns a fixed 23:30 between midnight and 03:00", () => {
    expect(defaultLogTimeValue(new Date(2026, 7, 29, 0, 40))).toBe("23:30");
    expect(defaultLogTimeValue(new Date(2026, 7, 29, 2, 59))).toBe("23:30");
  });
});

describe("decideChipTapAction", () => {
  it("creates a catalog-only chip (no real item yet) regardless of countable/loggedCount", () => {
    const catalogOnly = makeCandidate({ itemIdentity: "" });
    expect(decideChipTapAction(catalogOnly, 0, true)).toBe("create");
    expect(decideChipTapAction(catalogOnly, 5, true)).toBe("create");
    expect(decideChipTapAction(catalogOnly, 5, false)).toBe("create");
  });

  it("increments a countable item that isn't logged yet today", () => {
    expect(decideChipTapAction(makeCandidate(), 0, true)).toBe("increment");
  });

  it("decrements a countable item that's already logged at least once", () => {
    expect(decideChipTapAction(makeCandidate(), 1, true)).toBe("decrement");
    expect(decideChipTapAction(makeCandidate(), 3, true)).toBe("decrement");
  });

  it("toggles a non-countable item regardless of its logged count", () => {
    expect(decideChipTapAction(makeCandidate(), 0, false)).toBe("toggle");
    expect(decideChipTapAction(makeCandidate(), 1, false)).toBe("toggle");
  });
});

// Regression: before this fix, a legacy untagged log (mealTag: null — from
// before per-meal tagging existed, e.g. every pre-f84fe44 supplement log)
// was invisible to every meal-scoped count, since `null !== "Morning"` etc.
// That made a chip read as "not logged" in every time-of-day tab even
// though it genuinely was, so tapping it created a second, duplicate log
// on top of the untagged one instead of recognizing it was already logged.
describe("loggedCountsForDate", () => {
  it("counts an exact meal-tag match", () => {
    const logs = [makeLog({ mealTag: "Morning" })];
    expect(loggedCountsForDate(logs, "2026-01-01", "Morning").get("item-1")).toBe(1);
    expect(loggedCountsForDate(logs, "2026-01-01", "Afternoon").get("item-1")).toBeUndefined();
  });

  it("counts a legacy untagged row toward every meal, not none", () => {
    const logs = [makeLog({ mealTag: null })];
    expect(loggedCountsForDate(logs, "2026-01-01", "Morning").get("item-1")).toBe(1);
    expect(loggedCountsForDate(logs, "2026-01-01", "Afternoon").get("item-1")).toBe(1);
    expect(loggedCountsForDate(logs, "2026-01-01", "Night").get("item-1")).toBe(1);
  });

  it("combined with decideChipTapAction, a legacy untagged row means the chip decrements (removes) rather than adding a duplicate", () => {
    const logs = [makeLog({ mealTag: null })];
    const loggedCount = loggedCountsForDate(logs, "2026-01-01", "Morning").get("item-1") ?? 0;
    expect(decideChipTapAction(makeCandidate(), loggedCount, true)).toBe("decrement");
  });

  it("ignores rows on a different date", () => {
    const logs = [makeLog({ date: "2026-01-02", mealTag: null })];
    expect(loggedCountsForDate(logs, "2026-01-01", "Morning").get("item-1")).toBeUndefined();
  });
});

describe("dayTimelineEntries", () => {
  function makeItem(overrides: Partial<RawItem> = {}): RawItem {
    return {
      identity: "item-1",
      itemType: "food",
      rawName: "Apple",
      category: "Fruit",
      categoryId: null,
      isArchived: false,
      createdDate: null,
      reminderTime: null,
      unit: null,
      ...overrides,
    };
  }

  it("breaks a same-`updatedAt` tie by identity, newest tap first", () => {
    const items = [makeItem({ identity: "item-1", rawName: "Apple" }), makeItem({ identity: "item-2", rawName: "Banana" })];
    // Both logged in the same minute — the real-world case (the Log page's
    // time picker is minute-precision and stays fixed across taps), so
    // `updatedAt` alone can't tell them apart; a lexicographically later
    // identity (as `createTimeOrderedId` produces for a later tap) must win.
    const sameMinute = "2026-01-01T08:00:00.000Z";
    const first = makeLog({ identity: "aaaaaaaa-0000-7000-8000-000000000001", itemIdentity: "item-1", updatedAt: sameMinute });
    const second = makeLog({ identity: "aaaaaaaa-0000-7000-8000-000000000002", itemIdentity: "item-2", updatedAt: sameMinute });
    // Deliberately passed in reverse of insertion order, to rule out the
    // sort silently relying on pre-sort array order.
    const entries = dayTimelineEntries(items, [first, second], [], "2026-01-01");
    expect(entries.map((e) => e.item)).toEqual(["Banana", "Apple"]);
  });
});

describe("createTimeOrderedId", () => {
  it("produces a valid v7 UUID", () => {
    const id = createTimeOrderedId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("sorts later-timestamped ids after earlier ones", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const earlier = createTimeOrderedId();
    vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
    const later = createTimeOrderedId();
    expect(later > earlier).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

describe("combineDateAndTime", () => {
  it("uses the given date, not today's date — logging for a past day must not silently stamp it with today", () => {
    const iso = combineDateAndTime("2026-01-15", "09:30");
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0); // January
    expect(d.getDate()).toBe(15);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("round-trips through toTimeInputValue back to the same HH:MM", () => {
    const iso = combineDateAndTime("2026-06-01", "23:45");
    expect(toTimeInputValue(iso)).toBe("23:45");
  });
});
