import { describe, expect, it } from "vitest";
import { optimalStatusColor, statusColor } from "./labStatus";

describe("statusColor", () => {
  it("maps in-range to good and out-of-range to warning", () => {
    expect(statusColor("in")).toBe("var(--status-good)");
    expect(statusColor("low")).toBe("var(--status-warning)");
    expect(statusColor("high")).toBe("var(--status-warning)");
    expect(statusColor(null)).toBe("var(--text-muted)");
  });
});

describe("optimalStatusColor", () => {
  it("is green in band, red outside, muted with no range", () => {
    expect(optimalStatusColor("in")).toBe("var(--status-good)");
    expect(optimalStatusColor("low")).toBe("var(--status-critical)");
    expect(optimalStatusColor("high")).toBe("var(--status-critical)");
    expect(optimalStatusColor(null)).toBe("var(--text-muted)");
  });
});
