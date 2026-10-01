import { describe, expect, it } from "vitest";
import {
  averageTimeOnToiletMinutes,
  bristolAssessedDates,
  bristolBandDistribution,
  bristolScoreSeries,
  bristolTypeDates,
  digestiveSymptomDays,
  digestiveSymptomDetail,
  hygieneDistribution,
  stoolColorDistribution,
  movementSummary,
  timeOfDay,
  withMovementStats,
} from "./digestion";
import { makeEvent, makeStoolLog } from "@/lib/testFixtures";

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

describe("averageTimeOnToiletMinutes", () => {
  it("returns null when nothing recorded a duration", () => {
    expect(averageTimeOnToiletMinutes([makeStoolLog({ timeOnToiletMinutes: null })])).toBeNull();
  });

  it("averages only entries that recorded a duration", () => {
    const logs = [makeStoolLog({ timeOnToiletMinutes: 5 }), makeStoolLog({ timeOnToiletMinutes: 10 }), makeStoolLog({ timeOnToiletMinutes: null })];
    expect(averageTimeOnToiletMinutes(logs)).toBe(7.5);
  });
});

describe("movementSummary", () => {
  it("averages a day from the first movement ever logged, not the whole range", () => {
    const logs = ["2026-01-05", "2026-01-06", "2026-01-06", "2026-01-08"].map((date) => makeStoolLog({ date }));
    expect(movementSummary(logs, { start: "2026-01-01", end: "2026-01-08" })).toEqual({ count: 4, perDay: 1 });
  });
});

describe("digestive symptom days", () => {
  const symptom = (date: string, item = "Bloating", updatedAt: string | null = null) =>
    makeEvent({ date, item, itemType: "outcome", category: "Digestive Symptom", value: 1, completed: true, updatedAt });
  const other = (date: string) => makeEvent({ date, item: "Headache", itemType: "outcome", category: "Other Symptom", value: 1, completed: true });

  it("counts days with a digestive symptom out of the days symptoms were logged", () => {
    const events = [symptom("2026-01-02"), symptom("2026-01-02", "Gas"), other("2026-01-03"), symptom("2026-01-04")];
    const { now } = digestiveSymptomDays(events, { start: "2026-01-02", end: "2026-01-04" });
    expect(now).toEqual({ days: 2, trackedDays: 3 });
  });

  it("gives a symptom's bars, usual time of day and last occurrence", () => {
    const events = [symptom("2026-01-02", "Bloating", "2026-01-02T19:30:00"), other("2026-01-03"), symptom("2026-01-04", "Bloating", "2026-01-04T20:15:00")];
    const detail = digestiveSymptomDetail(events, "Bloating", { start: "2026-01-01", end: "2026-01-04" });
    expect(detail.bars.map((b) => b.value)).toEqual([null, 1, 0, 1]);
    expect(detail.mostOften).toBe("Evening");
    expect(detail.last).toEqual({ date: "2026-01-04", at: "2026-01-04T20:15:00" });
    expect(detail.now).toEqual({ days: 2, trackedDays: 3 });
  });
});

describe("timeOfDay", () => {
  it("splits the day into morning, afternoon, evening and night", () => {
    expect([4, 5, 12, 17, 22].map(timeOfDay)).toEqual(["Night", "Morning", "Afternoon", "Evening", "Night"]);
  });
});

describe("withMovementStats", () => {
  it("merges characteristics and movement symptoms, counted once per movement", () => {
    const logs = [makeStoolLog({ characteristics: ["Sticky"], symptoms: ["Urgency"] }), makeStoolLog({ characteristics: [], symptoms: ["Urgency"] })];
    expect(withMovementStats(logs)).toEqual([
      { label: "Urgency", count: 2, total: 2 },
      { label: "Sticky", count: 1, total: 2 },
    ]);
  });
});
