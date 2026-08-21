import { describe, expect, it } from "vitest";
import { combineDateAndTime, decideChipTapAction, toTimeInputValue, type LogCandidate } from "./logCandidates";

function makeCandidate(overrides: Partial<LogCandidate> = {}): LogCandidate {
  return { key: "item-1", item: "Apple", itemType: "food", category: "Fruit", itemIdentity: "item-1", count: 0, ...overrides };
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
