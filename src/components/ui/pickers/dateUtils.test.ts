import { describe, expect, it } from "vitest";
import { daysInMonth, joinDateTime, mondayIndexOfFirst, parseISODate, splitDateTime, toISODate } from "./dateUtils";

describe("dateUtils", () => {
  it("round-trips an ISO date", () => {
    expect(toISODate(2026, 8, 5)).toBe("2026-09-05");
    expect(parseISODate("2026-09-05")).toEqual({ y: 2026, m: 8, d: 5 });
    expect(parseISODate("")).toBeNull();
  });

  it("counts days and finds the Monday-first offset", () => {
    expect(daysInMonth(2024, 1)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(30);
    // 1 Sep 2026 is a Tuesday.
    expect(mondayIndexOfFirst(2026, 8)).toBe(1);
  });

  it("splits and joins date-times", () => {
    expect(splitDateTime("2026-09-20T14:05")).toEqual({ date: "2026-09-20", time: "14:05" });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
    expect(joinDateTime("2026-09-20", "08:30")).toBe("2026-09-20T08:30");
    expect(joinDateTime("2026-09-20", "")).toBe("2026-09-20T00:00");
    expect(joinDateTime("", "08:30")).toBe("");
  });
});
