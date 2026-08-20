import { describe, expect, it } from "vitest";
import { generateBristolPatterns } from "./bristolPatterns";
import { makeEvent, makeStoolLog } from "@/lib/testFixtures";

describe("generateBristolPatterns", () => {
  it("returns an empty array when no Bristol data has ever been logged", () => {
    expect(generateBristolPatterns([], [], [])).toEqual([]);
  });

  it("returns an empty array on a sparse dataset that can't clear the sample-size gate", () => {
    const stoolLogs = [makeStoolLog({ date: "2026-01-01", bristolScores: [4] })];
    const events = [makeEvent({ itemType: "food", item: "Coffee", date: "2026-01-01", completed: true })];
    expect(generateBristolPatterns(events, stoolLogs, [])).toEqual([]);
  });

  it("does not throw on a larger dataset", () => {
    const stoolLogs = Array.from({ length: 30 }, (_, i) =>
      makeStoolLog({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, bristolScores: [i % 2 === 0 ? 4 : 1] }),
    );
    const events = Array.from({ length: 30 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Coffee", date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, completed: i % 3 === 0 }),
    );
    expect(() => generateBristolPatterns(events, stoolLogs, [])).not.toThrow();
  });
});
