import { describe, expect, it } from "vitest";
import type { LabMarker } from "@/lib/supabase/labs";
import {
  clipMarkers,
  effectiveRange,
  labsSpan,
  latestResults,
  markerHighlights,
  parseNum,
  BAND_LEFT_PCT,
  BAND_RIGHT_PCT,
  rangeBar,
  rangeStatus,
  summariseWindow,
} from "./labs";

function marker(partial: Partial<LabMarker> & { id: string; name: string }): LabMarker {
  return {
    panelId: null,
    unit: null,
    refLow: null,
    refHigh: null,
    optimalLow: null,
    optimalHigh: null,
    sortOrder: 0,
    results: [],
    ...partial,
  };
}

function result(measuredOn: string, value: number) {
  return { id: `${measuredOn}-${value}`, markerId: "m", measuredOn, value, lab: null, note: null };
}

describe("rangeStatus", () => {
  it("returns null without a reference range", () => {
    expect(rangeStatus(5, null, null)).toBeNull();
  });
  it("flags below low and above high, bounds inclusive", () => {
    expect(rangeStatus(0.2, 0.4, 4)).toBe("low");
    expect(rangeStatus(5, 0.4, 4)).toBe("high");
    expect(rangeStatus(0.4, 0.4, 4)).toBe("in");
  });
  it("handles a one-sided range", () => {
    expect(rangeStatus(10, 30, null)).toBe("low");
    expect(rangeStatus(2, null, 4)).toBe("in");
  });
});

describe("effectiveRange", () => {
  it("prefers the optimal range when one is set", () => {
    expect(effectiveRange({ refLow: 15, refHigh: 150, optimalLow: 50, optimalHigh: 120 })).toEqual({
      low: 50,
      high: 120,
      basis: "optimal",
    });
  });
  it("falls back to the reference range, then to nothing", () => {
    expect(effectiveRange({ refLow: 0.4, refHigh: 4, optimalLow: null, optimalHigh: null })).toEqual({
      low: 0.4,
      high: 4,
      basis: "reference",
    });
    expect(effectiveRange({ refLow: null, refHigh: null, optimalLow: null, optimalHigh: null })).toEqual({
      low: null,
      high: null,
      basis: null,
    });
  });
});

describe("rangeBar", () => {
  it("puts every band in the same place", () => {
    const a = rangeBar(80, 95)!;
    const b = rangeBar(0.4, 4)!;
    expect(a.bandLeftPct).toBe(BAND_LEFT_PCT);
    expect(a.bandRightPct).toBe(BAND_RIGHT_PCT);
    expect(b.bandLeftPct).toBe(a.bandLeftPct);
    expect(b.bandRightPct).toBe(a.bandRightPct);
  });
  it("places in-band values inside the band, proportionally", () => {
    const bar = rangeBar(80, 95)!;
    expect(bar.pct(80)).toBe(BAND_LEFT_PCT);
    expect(bar.pct(95)).toBe(BAND_RIGHT_PCT);
    expect(bar.pct(87.5)).toBeCloseTo(50);
  });
  it("puts low values left and high values right, stopping short of the ends", () => {
    const bar = rangeBar(1.9, 7)!;
    expect(bar.pct(1.3)).toBeLessThan(BAND_LEFT_PCT);
    expect(bar.pct(1.3)).toBeGreaterThan(0);
    expect(bar.pct(-1000)).toBeCloseTo(2);
    expect(bar.pct(7.2)).toBeGreaterThan(BAND_RIGHT_PCT);
    expect(bar.pct(10_000)).toBeCloseTo(98);
  });
  it("runs a one-sided band to its open end", () => {
    const low = rangeBar(40, null)!;
    expect(low.bandRightPct).toBe(100);
    expect(low.pct(30)).toBeLessThan(BAND_LEFT_PCT);
    expect(low.pct(60)).toBeGreaterThan(BAND_LEFT_PCT);
    expect(low.pct(1e6)).toBeLessThanOrEqual(100);
    const high = rangeBar(null, 5)!;
    expect(high.bandLeftPct).toBe(0);
    expect(high.pct(6)).toBeGreaterThan(BAND_RIGHT_PCT);
    expect(high.pct(2)).toBeLessThan(BAND_RIGHT_PCT);
    expect(high.pct(-1e6)).toBeGreaterThanOrEqual(0);
  });
  it("is null without a usable range", () => {
    expect(rangeBar(null, null)).toBeNull();
    expect(rangeBar(5, 5)).toBeNull();
  });
});

describe("parseNum", () => {
  it("accepts comma or dot separators, rejects non-numbers", () => {
    expect(parseNum("1,5")).toBe(1.5);
    expect(parseNum(" 12 ")).toBe(12);
    expect(parseNum("")).toBeNull();
    expect(parseNum("x")).toBeNull();
  });
});

describe("labsSpan", () => {
  it("spans the oldest and newest reading across markers", () => {
    const markers = [
      marker({ id: "a", name: "A", results: [result("2020-01-01", 1), result("2022-06-01", 2)] }),
      marker({ id: "b", name: "B", results: [result("2019-03-03", 1), result("2021-01-01", 2)] }),
    ];
    expect(labsSpan(markers)).toEqual({ start: "2019-03-03", end: "2022-06-01" });
  });
  it("is null with no readings", () => {
    expect(labsSpan([marker({ id: "a", name: "A" })])).toBeNull();
  });
});

describe("clipMarkers", () => {
  it("drops readings before the cutoff and markers left empty", () => {
    const markers = [
      marker({ id: "a", name: "A", results: [result("2020-01-01", 1), result("2025-01-01", 2)] }),
      marker({ id: "b", name: "B", results: [result("2019-01-01", 1)] }),
    ];
    const clipped = clipMarkers(markers, "2024-01-01");
    expect(clipped).toHaveLength(1);
    expect(clipped[0].id).toBe("a");
    expect(clipped[0].results).toHaveLength(1);
  });
  it("returns every non-empty marker for a null cutoff", () => {
    const markers = [marker({ id: "a", name: "A", results: [result("2020-01-01", 1)] }), marker({ id: "b", name: "B" })];
    expect(clipMarkers(markers, null)).toHaveLength(1);
  });
});

describe("summariseWindow", () => {
  it("is null for an empty window", () => {
    expect(summariseWindow([])).toBeNull();
  });
  it("returns the mean, spread, latest and the reading before it", () => {
    const s = summariseWindow([result("2025-01-01", 2), result("2025-06-01", 4), result("2025-03-01", 3)])!;
    expect(s.count).toBe(3);
    expect(s.mean).toBe(3);
    expect(s.min).toBe(2);
    expect(s.max).toBe(4);
    expect(s.latest).toBe(4);
    expect(s.latestOn).toBe("2025-06-01");
    expect(s.previous).toBe(3);
  });
  it("has no previous with a single reading", () => {
    const s = summariseWindow([result("2025-01-01", 2)])!;
    expect(s.mean).toBe(2);
    expect(s.previous).toBeNull();
  });
});

describe("latestResults", () => {
  const r = (measuredOn: string, value: number) => ({ id: `${measuredOn}-${value}`, markerId: "m", measuredOn, value, lab: null, note: null });

  it("keeps each marker's newest result, however old, and drops markers with none", () => {
    const markers = [
      marker({ id: "alp", name: "ALP", results: [r("2024-03-01", 70), r("2023-01-01", 60)] }),
      marker({ id: "fer", name: "Ferritin", results: [r("2025-01-01", 30), r("2026-08-26", 41)] }),
      marker({ id: "none", name: "None" }),
    ];
    expect(latestResults(markers).map((m) => [m.id, m.results.map((x) => x.measuredOn)])).toEqual([
      ["alp", ["2024-03-01"]],
      ["fer", ["2026-08-26"]],
    ]);
  });
});

describe("markerHighlights", () => {
  const r = (measuredOn: string, value: number) => ({ id: `${measuredOn}-${value}`, markerId: "m", measuredOn, value, lab: null, note: null });

  it("lists out-of-range first, then back in range, then notable moves, and skips small moves", () => {
    const markers = [
      marker({ id: "moved", name: "Moved", refLow: 0, refHigh: 10, results: [r("2026-01-01", 3), r("2026-05-10", 7)] }),
      marker({ id: "still", name: "Still", refLow: 0, refHigh: 10, results: [r("2026-01-01", 5), r("2026-05-10", 5.5)] }),
      marker({ id: "back", name: "Back", refLow: 0, refHigh: 10, results: [r("2026-01-01", 12), r("2026-05-11", 9)] }),
      marker({ id: "high", name: "High", refLow: 0, refHigh: 10, results: [r("2026-01-01", 9), r("2026-05-08", 11)] }),
      marker({ id: "old", name: "Old", refLow: 0, refHigh: 10, results: [r("2025-01-01", 20)] }),
    ];
    const summary = markerHighlights(markers, "2026-05-05", "2026-05-11");
    expect(summary.measured).toBe(4);
    expect(summary.items.map((i) => [i.marker.id, i.kind])).toEqual([
      ["high", "out"],
      ["back", "back"],
      ["moved", "moved"],
    ]);
    expect(summary.items[0].previous).toEqual({ value: 9, measuredOn: "2026-01-01" });
  });

  it("judges a marker without a two-sided range by relative change", () => {
    const markers = [
      marker({ id: "a", name: "A", results: [r("2026-01-01", 100), r("2026-05-10", 125)] }),
      marker({ id: "b", name: "B", results: [r("2026-01-01", 100), r("2026-05-10", 110)] }),
    ];
    expect(markerHighlights(markers, "2026-05-04", "2026-05-10").items.map((i) => i.marker.id)).toEqual(["a"]);
  });
});
