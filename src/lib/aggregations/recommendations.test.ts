import { describe, expect, it } from "vitest";
import { generateInsights, trackingCoverageSummary } from "./recommendations";
import { makeEvent } from "@/lib/testFixtures";

describe("generateInsights", () => {
  it("returns an empty array for no events", () => {
    expect(generateInsights([])).toEqual([]);
  });

  it("never surfaces a category that's never been logged", () => {
    // Dataset span exists (from a habit), but no food category has ever appeared.
    const events = [makeEvent({ itemType: "habit", date: "2026-01-01" })];
    expect(generateInsights(events)).toEqual([]);
  });

  it("flags a food category tracked on 0 of the last 14 days, with a recommendation", () => {
    const events = [
      // Tracked once, 30 days before the dataset's end — outside the recent window.
      makeEvent({ itemType: "food", category: "Fats", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "habit", date: "2026-01-31" }), // pushes the dataset span out to 01-31
    ];
    const insights = generateInsights(events);
    const fats = insights.find((i) => i.title.startsWith("Fats"))!;
    expect(fats.observed).toContain("0 of the last 14 days");
    expect(fats.recommendation).not.toBeNull();
  });

  it("does not flag a category tracked more than the threshold in the recent window", () => {
    const dates = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    const events = dates.map((d) => makeEvent({ itemType: "food", category: "Veggies", date: d, completed: true }));
    const insights = generateInsights(events);
    expect(insights.find((i) => i.title.startsWith("Veggies"))).toBeUndefined();
  });

  it("gives no recommendation when the category has some (but low) recent tracking", () => {
    const events = [
      makeEvent({ itemType: "food", category: "Fish", date: "2026-01-01", completed: true }),
      makeEvent({ itemType: "food", category: "Fish", date: "2026-01-02", completed: true }),
    ];
    const insights = generateInsights(events);
    const fish = insights.find((i) => i.title.startsWith("Fish"))!;
    expect(fish.recommendation).toBeNull();
  });

  it("only considers food events, never counting a habit/supplement/symptom category", () => {
    const events = [makeEvent({ itemType: "supplement", category: "Fats", date: "2026-01-01" })];
    expect(generateInsights(events)).toEqual([]);
  });
});

describe("trackingCoverageSummary", () => {
  it("returns null for no events", () => {
    expect(trackingCoverageSummary([])).toBeNull();
  });

  it("computes coverage over the full calendar span, counting gap days", () => {
    const events = [makeEvent({ date: "2026-01-01" }), makeEvent({ date: "2026-01-10" })];
    const summary = trackingCoverageSummary(events)!;
    expect(summary.totalCalendarDays).toBe(10);
    expect(summary.totalTrackedDays).toBe(2);
    expect(summary.gapDays).toBe(8);
    expect(summary.coveragePct).toBe(20);
  });

  it("reports 100% coverage with 0 gap days when every day in the span was tracked", () => {
    const events = [makeEvent({ date: "2026-01-01" }), makeEvent({ date: "2026-01-02" }), makeEvent({ date: "2026-01-03" })];
    const summary = trackingCoverageSummary(events)!;
    expect(summary.coveragePct).toBe(100);
    expect(summary.gapDays).toBe(0);
  });

  it("dedups multiple events on the same day to one tracked day", () => {
    const events = [makeEvent({ date: "2026-01-01" }), makeEvent({ date: "2026-01-01", item: "Other" })];
    const summary = trackingCoverageSummary(events)!;
    expect(summary.totalTrackedDays).toBe(1);
    expect(summary.totalCalendarDays).toBe(1);
  });
});
