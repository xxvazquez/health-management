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
});
