import { describe, expect, it } from "vitest";
import { parseNum, rangeStatus, statusColor } from "./labStatus";

describe("rangeStatus", () => {
  it("returns null when the marker has no reference range", () => {
    expect(rangeStatus(5, null, null)).toBeNull();
  });

  it("flags values below the low bound and above the high bound", () => {
    expect(rangeStatus(0.2, 0.4, 4)).toBe("low");
    expect(rangeStatus(5.1, 0.4, 4)).toBe("high");
    expect(rangeStatus(2, 0.4, 4)).toBe("in");
  });

  it("treats the bounds themselves as in range", () => {
    expect(rangeStatus(0.4, 0.4, 4)).toBe("in");
    expect(rangeStatus(4, 0.4, 4)).toBe("in");
  });

  it("works with a one-sided range", () => {
    expect(rangeStatus(10, 30, null)).toBe("low");
    expect(rangeStatus(40, 30, null)).toBe("in");
    expect(rangeStatus(5, null, 4)).toBe("high");
  });
});

describe("statusColor", () => {
  it("maps in-range to good and out-of-range to warning", () => {
    expect(statusColor("in")).toBe("var(--status-good)");
    expect(statusColor("low")).toBe("var(--status-warning)");
    expect(statusColor("high")).toBe("var(--status-warning)");
    expect(statusColor(null)).toBe("var(--text-muted)");
  });
});

describe("parseNum", () => {
  it("accepts a comma or dot decimal separator", () => {
    expect(parseNum("1.5")).toBe(1.5);
    expect(parseNum("1,5")).toBe(1.5);
    expect(parseNum("  12 ")).toBe(12);
  });

  it("rejects blanks and non-numbers", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum("   ")).toBeNull();
    expect(parseNum("abc")).toBeNull();
  });
});
