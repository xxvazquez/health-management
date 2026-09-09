import { describe, expect, it } from "vitest";
import type { LabMarker } from "@/lib/supabase/labs";
import {
  clipMarkers,
  effectiveRange,
  flaggedReadings,
  headlineMarkers,
  labsSpan,
  normalizedSeries,
  parseNum,
  rangeBar,
  rangeCutoff,
  rangeStatus,
  LAB_RANGES,
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
  it("puts the value on the reference-range track with the optimal band inside it", () => {
    const bar = rangeBar(78, 50, 150, 100, 150);
    expect(bar).not.toBeNull();
    expect(bar!.trackLow).toBe(50);
    expect(bar!.trackHigh).toBe(150);
    expect(bar!.valuePct).toBeCloseTo(28);
    expect(bar!.bandLeftPct).toBeCloseTo(50);
    expect(bar!.bandRightPct).toBeCloseTo(100);
  });
  it("keeps the band inset from both ends when only the lab range is known", () => {
    const bar = rangeBar(13.4, 12, 15.5, null, null);
    expect(bar!.trackLow).toBeLessThan(12);
    expect(bar!.trackHigh).toBeGreaterThan(15.5);
    expect(bar!.bandLeftPct).toBeGreaterThan(0);
    expect(bar!.bandRightPct).toBeLessThan(100);
  });
  it("keeps a below-band value low on the track and clamps a wild one to the end", () => {
    const below = rangeBar(5, 15, 150, null, null)!;
    expect(below.valuePct).toBeLessThan(below.bandLeftPct);
    expect(below.valuePct).toBeGreaterThanOrEqual(0);
    expect(rangeBar(4000, 15, 150, null, null)!.valuePct).toBe(100);
  });
  it("does not push the track below zero for a non-negative marker", () => {
    expect(rangeBar(2, 0, 5, null, null)!.trackLow).toBe(0);
  });
  it("widens the optimal range into a track when there is no reference range", () => {
    const bar = rangeBar(8, null, null, 5, 8);
    expect(bar).not.toBeNull();
    expect(bar!.valuePct).toBeGreaterThan(bar!.bandLeftPct);
    expect(bar!.bandRightPct).toBeLessThan(100);
  });
  it("is null with neither range", () => {
    expect(rangeBar(5, null, null, null, null)).toBeNull();
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

describe("rangeCutoff", () => {
  it("subtracts the option's years from today, null for all", () => {
    expect(rangeCutoff(LAB_RANGES[0], "2026-09-04")).toBeNull();
    expect(rangeCutoff({ id: "2y", label: "2 years", years: 2 }, "2026-09-04")).toBe("2024-09-04");
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

describe("headlineMarkers", () => {
  it("includes pinned markers and anything out of range, out-of-range first", () => {
    const markers = [
      marker({ id: "tsh", name: "TSH", refLow: 0.4, refHigh: 4, results: [result("2025-01-01", 2), result("2025-06-01", 3)] }),
      marker({ id: "fer", name: "Ferrytyna", refLow: 13, refHigh: 150, results: [result("2025-01-01", 20), result("2025-06-01", 8)] }),
      marker({ id: "x", name: "Random", refLow: 0, refHigh: 10, results: [result("2025-06-01", 5)] }),
    ];
    const rows = headlineMarkers(markers, ["TSH", "Ferrytyna"]);
    expect(rows.map((r) => r.id)).toEqual(["fer", "tsh"]);
    expect(rows[0].status).toBe("low");
    expect(rows[0].deltaPct).toBeCloseTo(-60);
  });
  it("matches pins loosely across parentheticals and case", () => {
    const markers = [marker({ id: "hgb", name: "Hemoglobina (HGB)", results: [result("2025-06-01", 13)] })];
    expect(headlineMarkers(markers, ["hemoglobina"]).map((r) => r.id)).toEqual(["hgb"]);
  });
  it("reads a value inside the reference range but below optimal as low", () => {
    const markers = [
      marker({ id: "fer", name: "Ferritin", refLow: 15, refHigh: 150, optimalLow: 50, optimalHigh: 120, results: [result("2025-06-01", 32)] }),
    ];
    const rows = headlineMarkers(markers, []);
    expect(rows.map((r) => r.id)).toEqual(["fer"]);
    expect(rows[0].status).toBe("low");
    expect(rows[0].basis).toBe("optimal");
  });
});

describe("flaggedReadings", () => {
  it("returns the latest out-of-range reading per marker, newest first", () => {
    const markers = [
      marker({ id: "a", name: "A", refLow: 0, refHigh: 10, results: [result("2025-01-01", 20), result("2025-02-01", 5)] }),
      marker({ id: "b", name: "B", refLow: 0, refHigh: 10, results: [result("2025-03-01", 15)] }),
    ];
    const flagged = flaggedReadings(markers);
    expect(flagged.map((f) => f.markerId)).toEqual(["b"]);
    expect(flagged[0].status).toBe("high");
  });
  it("flags a value that clears the reference range but misses the optimal one", () => {
    const markers = [
      marker({ id: "fer", name: "Ferritin", refLow: 15, refHigh: 150, optimalLow: 50, optimalHigh: 120, results: [result("2025-06-01", 32)] }),
    ];
    const flagged = flaggedReadings(markers);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].status).toBe("low");
    expect(flagged[0].basis).toBe("optimal");
    expect(flagged[0].low).toBe(50);
  });
});

describe("normalizedSeries", () => {
  it("scales to percent of the reference midpoint when a range is set", () => {
    const markers = [marker({ id: "a", name: "A", refLow: 0, refHigh: 10, results: [result("2025-01-01", 5), result("2025-02-01", 10)] })];
    const { data, note } = normalizedSeries(markers);
    expect(note).toBe("midpoint");
    expect(data[0].a).toBe(100);
    expect(data[1].a).toBe(200);
  });
  it("min–max scales a marker with no range and merges dates", () => {
    const markers = [
      marker({ id: "a", name: "A", refLow: 0, refHigh: 10, results: [result("2025-01-01", 5)] }),
      marker({ id: "b", name: "B", results: [result("2025-01-01", 2), result("2025-02-01", 4)] }),
    ];
    const { data, note } = normalizedSeries(markers);
    expect(note).toBe("mixed");
    expect(data).toHaveLength(2);
    expect(data[0].b).toBe(0);
    expect(data[1].b).toBe(100);
  });
});
