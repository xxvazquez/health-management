import { describe, expect, it } from "vitest";
import { decideChipTapAction, type LogCandidate } from "./logCandidates";

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
