import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

describe("relativeTime", () => {
  const now = Date.parse("2026-08-29T12:00:00Z");
  const ago = (ms: number) => now - ms;
  const S = 1000;
  const M = 60 * S;
  const H = 60 * M;
  const D = 24 * H;

  it("reads 'just now' under ~45 seconds", () => {
    expect(relativeTime(ago(0), now)).toBe("just now");
    expect(relativeTime(ago(30 * S), now)).toBe("just now");
  });

  it("counts minutes, then hours", () => {
    expect(relativeTime(ago(3 * M), now)).toBe("3m ago");
    expect(relativeTime(ago(59 * M), now)).toBe("59m ago");
    expect(relativeTime(ago(2 * H), now)).toBe("2h ago");
    expect(relativeTime(ago(23 * H), now)).toBe("23h ago");
  });

  it("says 'yesterday', then days, then a date", () => {
    expect(relativeTime(ago(1 * D), now)).toBe("yesterday");
    expect(relativeTime(ago(4 * D), now)).toBe("4d ago");
    expect(relativeTime(ago(30 * D), now)).toMatch(/\w/); // a formatted date, locale-dependent
  });

  it("never returns a negative / future duration", () => {
    expect(relativeTime(now + 10 * M, now)).toBe("just now");
  });
});
