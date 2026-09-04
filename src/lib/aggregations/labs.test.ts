import { describe, expect, it } from "vitest";
import type { LabMarker } from "@/lib/supabase/labs";
import {
  clipMarkers,
  flaggedReadings,
  headlineMarkers,
  labsSpan,
  normalizedSeries,
  parseNum,
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
