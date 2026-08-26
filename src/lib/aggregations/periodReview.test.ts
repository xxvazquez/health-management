import { describe, expect, it } from "vitest";
import { buildPeriodReview } from "./periodReview";
import { makeEvent } from "@/lib/testFixtures";

const RANGE = { start: "2026-01-01", end: "2026-01-07" };

describe("buildPeriodReview", () => {
  it("reports no data for an empty range", () => {
    const review = buildPeriodReview([], [], [], RANGE);
    expect(review.hasData).toBe(false);
    expect(review.totals.foodLogs).toBe(0);
    expect(review.highlights).toEqual([]);
  });

  it("counts totals only within the given range", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-01-03" }),
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-02-03" }), // outside range
    ];
    const review = buildPeriodReview(events, [], [], RANGE);
    expect(review.totals.foodLogs).toBe(1);
    expect(review.hasData).toBe(true);
  });

  it("surfaces the most-logged food only when it recurs more than once", () => {
    const events = [
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-01-01" }),
      makeEvent({ itemType: "food", item: "Eggs", date: "2026-01-02" }),
      makeEvent({ itemType: "food", item: "Toast", date: "2026-01-03" }),
    ];
    const review = buildPeriodReview(events, [], [], RANGE);
    expect(review.highlights).toContain("Most logged food: Eggs (2×)");
  });

  it("includes a passed-in notes count without needing Supabase data", () => {
    const review = buildPeriodReview([], [], [], RANGE, 3);
    expect(review.totals.notesExchanged).toBe(3);
    expect(review.hasData).toBe(true);
  });
});
