import { describe, expect, it } from "vitest";
import {
  averageTimeOnToiletMinutes,
  bristolAssessedDates,
  bristolBandDistribution,
  bristolMonthlyScoreAverage,
  bristolScoreSeries,
  bristolTargetRangeChange,
  bristolTypeDates,
  digestionInsight,
  digestiveSymptomRateChange,
  hygieneDistribution,
  stoolCharacteristicStats,
  stoolColorDistribution,
  stoolSymptomStats,
} from "./digestion";
import { makeStoolLog } from "@/lib/testFixtures";

describe("bristolAssessedDates", () => {
  it("returns every logged date", () => {
    const logs = [makeStoolLog({ date: "2026-01-01" }), makeStoolLog({ date: "2026-01-02", bristolScores: [2] })];
    expect(bristolAssessedDates(logs)).toEqual(new Set(["2026-01-01", "2026-01-02"]));
  });
});

describe("bristolTypeDates", () => {
  it("matches a date if any of the entry's scores is in the wanted set", () => {
    const logs = [makeStoolLog({ date: "2026-01-01", bristolScores: [1, 4] })];
    expect(bristolTypeDates(logs, [3, 4])).toEqual(new Set(["2026-01-01"]));
    expect(bristolTypeDates(logs, [6, 7])).toEqual(new Set());
  });

  it("matches nothing for an entry with no scores", () => {
    const logs = [makeStoolLog({ date: "2026-01-01", bristolScores: [] })];
    expect(bristolTypeDates(logs, [1, 2, 3, 4, 5, 6, 7])).toEqual(new Set());
  });
});

describe("bristolBandDistribution", () => {
  it("bands 1-2 as Hard, 3-4 as Normal, 5-7 as Loose", () => {
    const logs = [makeStoolLog({ bristolScores: [1] }), makeStoolLog({ bristolScores: [4] }), makeStoolLog({ bristolScores: [7] })];
    const dist = bristolBandDistribution(logs);
    expect(dist.map((d) => d.band).sort()).toEqual(["Hard (1–2)", "Loose (5–7)", "Normal (3–4)"].sort());
  });

  it("counts both scores of a mixed entry, one in each of two bands", () => {
    const logs = [makeStoolLog({ bristolScores: [1, 4] })]; // one Hard reading, one Normal reading
    const dist = bristolBandDistribution(logs);
    const hard = dist.find((d) => d.band === "Hard (1–2)")!;
    const normal = dist.find((d) => d.band === "Normal (3–4)")!;
    expect(hard.count).toBe(1);
    expect(normal.count).toBe(1);
    // Two readings total from one entry, so each is 50% of the reading pool.
    expect(hard.sharePct).toBe(50);
    expect(normal.sharePct).toBe(50);
  });

  it("excludes entries with no scores from the distribution entirely", () => {
    const logs = [makeStoolLog({ bristolScores: [] })];
    expect(bristolBandDistribution(logs)).toEqual([]);
  });
});

describe("bristolTargetRangeChange", () => {
  it("reports insufficientData for no logs", () => {
    const result = bristolTargetRangeChange([]);
    expect(result.insufficientData).toBe(true);
    expect(result.recentPct).toBeNull();
  });

  it("reports insufficientData when the recent window has fewer than 4 entries", () => {
    const logs = [makeStoolLog({ date: "2026-01-01" }), makeStoolLog({ date: "2026-01-02" })];
    const result = bristolTargetRangeChange(logs);
    expect(result.insufficientData).toBe(true);
    expect(result.recentTotal).toBe(2);
  });

  it("computes recentPct with no prior-window comparison when the prior window lacks data", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-01", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-02", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-03", bristolScores: [1] }),
      makeStoolLog({ date: "2026-01-04", bristolScores: [4] }),
    ];
    const result = bristolTargetRangeChange(logs);
    expect(result.insufficientData).toBe(false);
    expect(result.recentPct).toBe(75); // 3 of 4 entries have a Normal (3-4) reading
    expect(result.priorPct).toBeNull();
  });

  it("counts an entry as in-target if any one of its multiple scores lands in the 3-4 band", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-01", bristolScores: [1, 4] }), // has a 4, counts
      makeStoolLog({ date: "2026-01-02", bristolScores: [1, 2] }), // no 3/4, doesn't count
      makeStoolLog({ date: "2026-01-03", bristolScores: [3] }),
      makeStoolLog({ date: "2026-01-04", bristolScores: [4] }),
    ];
    const result = bristolTargetRangeChange(logs);
    expect(result.recentPct).toBe(75); // 3 of 4 entries
  });

  it("counts every entry in the denominator, not just in-target ones", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-01", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-02", bristolScores: [1] }),
      makeStoolLog({ date: "2026-01-03", bristolScores: [1] }),
      makeStoolLog({ date: "2026-01-04", bristolScores: [6] }),
    ];
    const result = bristolTargetRangeChange(logs);
    expect(result.recentPct).toBe(25); // only 1 of 4 entries is in target
  });
});

describe("bristolScoreSeries", () => {
  it("excludes entries with no scores", () => {
    const logs = [makeStoolLog({ bristolScores: [] })];
    expect(bristolScoreSeries(logs)).toEqual([]);
  });

  it("emits one point per score, not per entry, for a multi-score entry", () => {
    const logs = [makeStoolLog({ id: "s1", date: "2026-01-01", loggedAt: "2026-01-01T09:00:00.000Z", bristolScores: [1, 5] })];
    const series = bristolScoreSeries(logs);
    expect(series).toHaveLength(2);
    expect(series.map((p) => p.value).sort()).toEqual([1, 5]);
    expect(series.every((p) => p.date === "2026-01-01")).toBe(true);
  });

  it("orders chronologically by date then by logged time within a day", () => {
    const logs = [
      makeStoolLog({ id: "later", date: "2026-01-01", loggedAt: "2026-01-01T18:00:00.000Z", bristolScores: [7] }),
      makeStoolLog({ id: "earlier", date: "2026-01-01", loggedAt: "2026-01-01T07:00:00.000Z", bristolScores: [1] }),
      makeStoolLog({ id: "next-day", date: "2026-01-02", loggedAt: "2026-01-02T07:00:00.000Z", bristolScores: [4] }),
    ];
    const series = bristolScoreSeries(logs);
    expect(series.map((p) => p.value)).toEqual([1, 7, 4]);
  });
});

describe("bristolMonthlyScoreAverage", () => {
  it("averages every individual score (including from multi-score entries) within a month", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-05", bristolScores: [2, 6] }), // avg contribution: 2 and 6
      makeStoolLog({ date: "2026-01-20", bristolScores: [4] }),
    ];
    const [point] = bristolMonthlyScoreAverage(logs);
    expect(point.monthStart).toBe("2026-01-01");
    expect(point.count).toBe(3);
    expect(point.avgScore).toBe(4); // (2 + 6 + 4) / 3
  });

  it("keeps separate months separate", () => {
    const logs = [makeStoolLog({ date: "2026-01-15", bristolScores: [4] }), makeStoolLog({ date: "2026-02-15", bristolScores: [2] })];
    const points = bristolMonthlyScoreAverage(logs);
    expect(points.map((p) => p.monthStart)).toEqual(["2026-01-01", "2026-02-01"]);
  });
});

describe("stoolCharacteristicStats", () => {
  it("omits a characteristic with zero occurrences", () => {
    const logs = [makeStoolLog({ isSticky: false, isSmelly: false })];
    expect(stoolCharacteristicStats(logs)).toEqual([]);
  });

  it("counts and sorts characteristics by frequency descending", () => {
    const logs = [
      makeStoolLog({ isSticky: true, isSmelly: false }),
      makeStoolLog({ isSticky: true, isSmelly: true }),
      makeStoolLog({ isSticky: false, isSmelly: true }),
    ];
    const stats = stoolCharacteristicStats(logs);
    expect(stats[0]).toMatchObject({ label: "Sticky", count: 2 });
    const smelly = stats.find((s) => s.label === "Smelly")!;
    expect(smelly.count).toBe(2);
  });
});

describe("stoolColorDistribution / hygieneDistribution", () => {
  it("excludes entries with no color / hygiene set", () => {
    const logs = [makeStoolLog({ color: null, hygiene: [] })];
    expect(stoolColorDistribution(logs)).toEqual([]);
    expect(hygieneDistribution(logs)).toEqual([]);
  });

  it("distributes by the set value", () => {
    const logs = [makeStoolLog({ color: "Brown" }), makeStoolLog({ color: "Brown" }), makeStoolLog({ color: "Green" })];
    const dist = stoolColorDistribution(logs);
    expect(dist[0]).toMatchObject({ label: "Brown", count: 2, sharePct: 66.7 });
  });

  it("counts each hygiene value of a multi-value entry", () => {
    const logs = [
      makeStoolLog({ hygiene: ["Dirty", "Water and soap"] }),
      makeStoolLog({ hygiene: ["Dirty"] }),
    ];
    const dist = hygieneDistribution(logs);
    expect(dist.find((d) => d.label === "Dirty")).toMatchObject({ count: 2, sharePct: 100 });
    expect(dist.find((d) => d.label === "Water and soap")).toMatchObject({ count: 1, sharePct: 50 });
  });
});

describe("stoolSymptomStats", () => {
  it("counts each symptom across entries, sorted by frequency", () => {
    const logs = [
      makeStoolLog({ symptoms: ["Urgency", "Mucus"] }),
      makeStoolLog({ symptoms: ["Urgency"] }),
      makeStoolLog({ symptoms: [] }),
    ];
    const stats = stoolSymptomStats(logs);
    expect(stats[0]).toMatchObject({ label: "Urgency", count: 2 });
    expect(stats.find((s) => s.label === "Mucus")).toMatchObject({ count: 1 });
  });
});

describe("averageTimeOnToiletMinutes", () => {
  it("returns null when nothing recorded a duration", () => {
    expect(averageTimeOnToiletMinutes([makeStoolLog({ timeOnToiletMinutes: null })])).toBeNull();
  });

  it("averages only entries that recorded a duration", () => {
    const logs = [makeStoolLog({ timeOnToiletMinutes: 5 }), makeStoolLog({ timeOnToiletMinutes: 10 }), makeStoolLog({ timeOnToiletMinutes: null })];
    expect(averageTimeOnToiletMinutes(logs)).toBe(7.5);
  });
});

describe("digestiveSymptomRateChange", () => {
  it("reports insufficientData for no tracked dates", () => {
    expect(digestiveSymptomRateChange([]).insufficientData).toBe(true);
  });
});

describe("digestionInsight", () => {
  it("reports insufficientData for no stool logs at all", () => {
    const result = digestionInsight([], []);
    expect(result.insufficientData).toBe(true);
    expect(result.detail).toBeNull();
  });

  it("mentions older data exists when there is history but not enough in the recent window", () => {
    const logs = [makeStoolLog({ date: "2020-01-01" }), makeStoolLog({ date: "2020-01-02" })];
    const result = digestionInsight([], logs);
    expect(result.insufficientData).toBe(true);
    expect(result.detail).toContain("older data");
  });

  it("produces a headline percentage once there's enough recent data", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-01", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-02", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-03", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-04", bristolScores: [4] }),
    ];
    const result = digestionInsight([], logs);
    expect(result.insufficientData).toBe(false);
    expect(result.headline).toContain("100%");
  });
});
