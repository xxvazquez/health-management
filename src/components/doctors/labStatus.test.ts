import { describe, expect, it } from "vitest";
import { statusColor } from "./labStatus";

describe("statusColor", () => {
  it("maps in-range to good and out-of-range to warning", () => {
    expect(statusColor("in")).toBe("var(--status-good)");
    expect(statusColor("low")).toBe("var(--status-warning)");
    expect(statusColor("high")).toBe("var(--status-warning)");
    expect(statusColor(null)).toBe("var(--text-muted)");
  });
});
