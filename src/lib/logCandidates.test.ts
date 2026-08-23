import { describe, expect, it } from "vitest";
import { combineDateAndTime, decideChipTapAction, loggedCountsForDate, toTimeInputValue, type LogCandidate } from "./logCandidates";
import type { RawLog } from "@/lib/types";

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
