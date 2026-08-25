import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  computeCurrentStreak,
  daysBetween,
  filterByDateRange,
  formatMinutes,
  formatMonthYear,
  getDatasetSpan,
  isoWeekStart,
  listDatesBetween,
  monthStart,
  pct,
  round1,
  trackedCalendarDates,
} from "./common";
import { makeEvent } from "@/lib/testFixtures";

describe("filterByDateRange", () => {
  it("returns everything when no range is given", () => {
    const items = [{ date: "2026-01-01" }, { date: "2026-02-01" }];
    expect(filterByDateRange(items)).toEqual(items);
  });

  it("keeps only dates within [start, end] inclusive", () => {
    const items = [{ date: "2026-01-01" }, { date: "2026-01-05" }, { date: "2026-01-10" }];
    const result = filterByDateRange(items, { start: "2026-01-02", end: "2026-01-05" });
    expect(result).toEqual([{ date: "2026-01-05" }]);
  });

  it("includes items exactly on the boundary dates", () => {
    const items = [{ date: "2026-01-01" }, { date: "2026-01-10" }];
    const result = filterByDateRange(items, { start: "2026-01-01", end: "2026-01-10" });
    expect(result).toHaveLength(2);
  });
});

describe("getDatasetSpan", () => {
  it("returns null for empty input", () => {
    expect(getDatasetSpan([])).toBeNull();
  });

  it("returns the same date as both start and end for a single item", () => {
    expect(getDatasetSpan([{ date: "2026-03-05" }])).toEqual({ start: "2026-03-05", end: "2026-03-05" });
  });

  it("finds min/max regardless of input order", () => {
    const items = [{ date: "2026-03-05" }, { date: "2026-01-01" }, { date: "2026-06-15" }, { date: "2026-02-01" }];
    expect(getDatasetSpan(items)).toEqual({ start: "2026-01-01", end: "2026-06-15" });
  });
});

describe("listDatesBetween", () => {
  it("returns a single date when start equals end", () => {
    expect(listDatesBetween("2026-01-01", "2026-01-01")).toEqual(["2026-01-01"]);
  });

  it("returns every calendar date inclusive, ascending", () => {
    expect(listDatesBetween("2026-01-28", "2026-02-02")).toEqual([
      "2026-01-28",
      "2026-01-29",
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
  });
});

describe("addDaysToDate", () => {
  it("adds positive days, crossing a month boundary", () => {
    expect(addDaysToDate("2026-01-30", 3)).toBe("2026-02-02");
  });

  it("subtracts with a negative count, crossing a month boundary", () => {
    expect(addDaysToDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap-year Feb 29 correctly", () => {
    expect(addDaysToDate("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysToDate("2028-02-29", 1)).toBe("2028-03-01");
  });
});

describe("daysBetween", () => {
  it("is positive when b is after a, negative when b is before a", () => {
    expect(daysBetween("2026-01-01", "2026-01-10")).toBe(9);
    expect(daysBetween("2026-01-10", "2026-01-01")).toBe(-9);
  });
});

describe("trackedCalendarDates", () => {
  it("dedups repeated dates across different items", () => {
    const events = [makeEvent({ date: "2026-01-01" }), makeEvent({ date: "2026-01-01", item: "Other" }), makeEvent({ date: "2026-01-02" })];
    expect(trackedCalendarDates(events)).toEqual(new Set(["2026-01-01", "2026-01-02"]));
  });
});

describe("computeCurrentStreak", () => {
  it("is 0 when the most recent tracked day wasn't completed", () => {
    const tracked = ["2026-01-01", "2026-01-02", "2026-01-03"];
    const completed = new Set(["2026-01-01", "2026-01-02"]);
    expect(computeCurrentStreak(tracked, completed)).toBe(0);
  });

  it("counts backward from the end until the first miss", () => {
    const tracked = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    const completed = new Set(["2026-01-03", "2026-01-04", "2026-01-05"]);
    expect(computeCurrentStreak(tracked, completed)).toBe(3);
  });

  it("is the full length when every tracked day was completed", () => {
    const tracked = ["2026-01-01", "2026-01-02", "2026-01-03"];
    expect(computeCurrentStreak(tracked, new Set(tracked))).toBe(3);
  });

  it("is 0 for an empty tracked-dates list", () => {
    expect(computeCurrentStreak([], new Set())).toBe(0);
  });

  it("only counts tracked days, not the raw gap in calendar time — an untracked gap breaks nothing", () => {
    // Tracked days deliberately skip 2026-01-03 (not tracked at all that day).
    const tracked = ["2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05"];
    const completed = new Set(tracked); // completed every tracked day
    expect(computeCurrentStreak(tracked, completed)).toBe(4);
  });
});

describe("round1 / pct", () => {
  it("round1 rounds to one decimal place", () => {
    expect(round1(1.25)).toBe(1.3);
    expect(round1(1.24)).toBe(1.2);
    expect(round1(1)).toBe(1);
  });

  it("pct computes a rounded percentage", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 4)).toBe(50);
  });

  it("pct returns 0 for a zero denominator instead of NaN/Infinity", () => {
    expect(pct(0, 0)).toBe(0);
    expect(pct(5, 0)).toBe(0);
  });
});

describe("isoWeekStart", () => {
  it("returns the same date for a Monday", () => {
    // 2026-01-05 is a Monday.
    expect(isoWeekStart("2026-01-05")).toBe("2026-01-05");
  });

  it("rolls a Sunday back to the preceding Monday", () => {
    // 2026-01-11 is a Sunday; its ISO week started 2026-01-05.
    expect(isoWeekStart("2026-01-11")).toBe("2026-01-05");
  });

  it("rolls a mid-week date back to that week's Monday", () => {
    // 2026-01-08 is a Thursday.
    expect(isoWeekStart("2026-01-08")).toBe("2026-01-05");
  });
});

describe("monthStart", () => {
  it("truncates any date in a month to that month's first day", () => {
    expect(monthStart("2026-07-19")).toBe("2026-07-01");
    expect(monthStart("2026-07-01")).toBe("2026-07-01");
  });
});

describe("formatMonthYear", () => {
  it("formats as 'Mon YY'", () => {
    expect(formatMonthYear("2026-08-26")).toBe("Aug 26");
  });
});

describe("formatMinutes", () => {
  it("omits the hours part when under an hour", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("omits the minutes part on an exact hour", () => {
    expect(formatMinutes(120)).toBe("2h");
  });

  it("shows both parts otherwise", () => {
    expect(formatMinutes(150)).toBe("2h 30m");
  });

  it("formats 0 minutes as '0m'", () => {
    expect(formatMinutes(0)).toBe("0m");
  });
});
