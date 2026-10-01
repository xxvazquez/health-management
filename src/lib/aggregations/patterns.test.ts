import { describe, expect, it } from "vitest";
import { checkInOutcomes, stoolOutcomes, computeAssociationFromDateSets, fisherExactP, generateTopPatterns, matchCategory, matchItem, patternLinkKey, plausibleLags } from "./patterns";
import { makeEvent, makePeriodLog, makeStoolLog } from "@/lib/testFixtures";
import { addDaysToDate } from "./common";

describe("matchItem / matchCategory", () => {
  it("matchItem matches only the exact item name, and only when completed", () => {
    const matcher = matchItem("Coffee");
    expect(matcher.test(makeEvent({ item: "Coffee", completed: true }))).toBe(true);
    expect(matcher.test(makeEvent({ item: "Coffee", completed: false }))).toBe(false);
    expect(matcher.test(makeEvent({ item: "Tea", completed: true }))).toBe(false);
  });

  it("matchCategory matches any completed item in that category", () => {
    const matcher = matchCategory("Dairy");
    expect(matcher.test(makeEvent({ category: "Dairy", item: "Milk", completed: true }))).toBe(true);
    expect(matcher.test(makeEvent({ category: "Dairy", item: "Cheese", completed: true }))).toBe(true);
    expect(matcher.test(makeEvent({ category: "Fruit", completed: true }))).toBe(false);
  });
});

describe("computeAssociationFromDateSets", () => {
  it("computes with/without percentages and their difference at lag 0", () => {
    const tracked = new Set(["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]);
    const cause = new Set(["2026-01-01", "2026-01-02"]); // "with" days
    const outcome = new Set(["2026-01-01", "2026-01-03"]); // occurred on 01 (with) and 03 (without)

    const result = computeAssociationFromDateSets(cause, outcome, tracked, 0, "Cause", "Outcome");
    expect(result.withTotal).toBe(2);
    expect(result.withCount).toBe(1); // only 01-01
    expect(result.withPct).toBe(50);
    expect(result.withoutTotal).toBe(2);
    expect(result.withoutCount).toBe(1); // only 01-03
    expect(result.withoutPct).toBe(50);
    expect(result.diffPct).toBe(0);
  });

  it("shifts the cause date backward by lagDays relative to the outcome date", () => {
    const tracked = new Set(["2026-01-02"]);
    const cause = new Set(["2026-01-01"]); // one day before the tracked outcome date
    const outcome = new Set(["2026-01-02"]);

    const lag0 = computeAssociationFromDateSets(cause, outcome, tracked, 0, "Cause", "Outcome");
    expect(lag0.withTotal).toBe(0); // cause date (01-02, lag 0) not in cause set

    const lag1 = computeAssociationFromDateSets(cause, outcome, tracked, 1, "Cause", "Outcome");
    expect(lag1.withTotal).toBe(1); // cause date shifts back to 01-01, which is in the cause set
    expect(lag1.withCount).toBe(1);
  });

  it("marks sampleTier 'insufficient' below the minimum exposed/unexposed thresholds (10 with, 5 without)", () => {
    const tracked = new Set(Array.from({ length: 10 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`));
    const cause = new Set(Array.from({ length: 9 }, (_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`)); // only 9 exposed
    const result = computeAssociationFromDateSets(cause, new Set(), tracked, 0, "Cause", "Outcome");
    expect(result.sampleTier).toBe("insufficient");
  });

  it("escalates sample tiers as exposed-day count grows: exploratory -> moderate -> strong", () => {
    const build = (exposedDays: number, totalDays: number) => {
      const tracked = new Set(Array.from({ length: totalDays }, (_, i) => `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`));
      const cause = new Set(Array.from(tracked).slice(0, exposedDays));
      return computeAssociationFromDateSets(cause, new Set(), tracked, 0, "Cause", "Outcome");
    };
    expect(build(15, 25).sampleTier).toBe("exploratory"); // 15 with, 10 without
    expect(build(25, 35).sampleTier).toBe("moderate"); // 25 with, 10 without
    expect(build(35, 45).sampleTier).toBe("strong"); // 35 with, 10 without
  });

  it("returns 0/0 percentages (not NaN) when a bucket has zero total", () => {
    const tracked = new Set(["2026-01-01"]);
    const cause = new Set(["2026-01-01"]); // every tracked date has the cause -> "without" bucket is empty
    const result = computeAssociationFromDateSets(cause, new Set(), tracked, 0, "Cause", "Outcome");
    expect(result.withoutTotal).toBe(0);
    expect(result.withoutPct).toBe(0);
  });

  it("skips cause dates outside the cause's own tracked days", () => {
    const tracked = new Set(["2026-01-01", "2026-01-02", "2026-01-03"]);
    const causeTracked = new Set(["2026-01-02", "2026-01-03"]);
    const result = computeAssociationFromDateSets(new Set(["2026-01-02"]), new Set(["2026-01-01"]), tracked, 0, "Cause", "Outcome", {
      causeTrackedDates: causeTracked,
    });
    expect(result.withTotal + result.withoutTotal).toBe(2);
    expect(result.withoutCount).toBe(0);
  });

  it("skips a same-day pair where the cause was logged after the outcome", () => {
    const tracked = new Set(["2026-01-01", "2026-01-02"]);
    const both = new Set(["2026-01-01", "2026-01-02"]);
    const at = (d: string, h: number) => Date.parse(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
    const result = computeAssociationFromDateSets(both, both, tracked, 0, "Cause", "Outcome", {
      causeTimes: new Map([["2026-01-01", at("2026-01-01", 8)], ["2026-01-02", at("2026-01-02", 20)]]),
      outcomeTimes: new Map([["2026-01-01", at("2026-01-01", 12)], ["2026-01-02", at("2026-01-02", 12)]]),
    });
    expect(result.withTotal).toBe(1);
  });
});

describe("generateTopPatterns", () => {
  it("returns an empty array for no events", () => {
    expect(generateTopPatterns([])).toEqual([]);
  });

  // 60 days: Milk every third day, Bloating the day after each Milk day
  // and now and then on other days too.
  const day = (n: number) => addDaysToDate("2026-03-01", n);
  const linked = Array.from({ length: 60 }, (_, n) => n).flatMap((n) => [
    makeEvent({ itemType: "food", item: "Bread", category: "Grains", date: day(n) }),
    ...(n % 3 === 0 ? [makeEvent({ itemType: "food", item: "Milk", category: "Dairy", date: day(n) })] : []),
    ...(n % 3 === 1 || n % 9 === 5 ? [makeEvent({ itemType: "outcome", item: "Bloating", category: "Digestive Symptom", date: day(n) })] : []),
  ]);

  it("finds a link that holds up, at its plausible delay", () => {
    const [link] = generateTopPatterns(linked);
    expect(link).toMatchObject({ outcomeLabel: "Bloating", causeLabel: "Milk", lagDays: 1 });
  });

  it("skips a pair the user marked not related", () => {
    const links = generateTopPatterns(linked, new Set([patternLinkKey("Bloating", "Milk")]));
    expect(links.some((l) => l.causeLabel === "Milk")).toBe(false);
  });

  it("drops a link where one side is near 0%", () => {
    const perfect = linked.filter((e) => !(e.item === "Bloating" && e.date !== day(0) && [5, 14, 23, 32, 41, 50, 59].map(day).includes(e.date)));
    expect(generateTopPatterns(perfect).some((l) => l.causeLabel === "Milk")).toBe(false);
  });

  it("finds no link when the supplement and the symptom were tracked in different months", () => {
    // Vitamin D every other day for 120 days, then stopped; symptom logging
    // only starts on day 90. Food is logged throughout.
    const events = Array.from({ length: 180 }, (_, n) => n).flatMap((n) => [
      makeEvent({ itemType: "food", item: "Bread", category: "Grains", date: day(n) }),
      ...(n < 120 && n % 2 === 0 ? [makeEvent({ itemType: "supplement", item: "Vitamin D", category: "Vitamins", date: day(n) })] : []),
      ...(n >= 90 && n % 3 !== 1 ? [makeEvent({ itemType: "outcome", item: "Tiredness", category: "Other Symptom", date: day(n) })] : []),
    ]);
    expect(generateTopPatterns(events).some((l) => l.causeLabel === "Vitamin D")).toBe(false);
  });

  it("tests cycle phases as triggers", () => {
    // 28-day cycles with a 5-day period; a headache on every luteal day.
    const periodLogs = Array.from({ length: 7 }, (_, c) => c).flatMap((c) =>
      Array.from({ length: 5 }, (_, i) => makePeriodLog({ date: day(c * 28 + i) })),
    );
    const events = Array.from({ length: 168 }, (_, n) => n).flatMap((n) => {
      const cycleDay = n % 28;
      const luteal = cycleDay >= 15;
      return [
        makeEvent({ itemType: "food", item: "Bread", category: "Grains", date: day(n) }),
        ...(luteal ? [makeEvent({ itemType: "outcome", item: "Headache", category: "Pain", date: day(n) })] : []),
        ...(!luteal && n % 7 === 3 ? [makeEvent({ itemType: "outcome", item: "Headache", category: "Pain", date: day(n) })] : []),
      ];
    });
    const links = generateTopPatterns(events, new Set(), periodLogs);
    expect(links.some((l) => l.causeLabel === "Luteal phase" && l.diffPct > 0)).toBe(true);
  });
});

describe("fisherExactP", () => {
  it("matches the textbook tea-tasting value", () => {
    // [[3, 1], [1, 3]] — two-sided p = 0.486
    expect(fisherExactP(3, 1, 1, 3)).toBeCloseTo(0.486, 3);
  });

  it("is 1 when there is no difference", () => {
    expect(fisherExactP(5, 5, 5, 5)).toBeCloseTo(1, 5);
  });
});

describe("plausibleLags", () => {
  it("allows longer delays for gut symptoms than for tiredness, and never tests menstrual ones", () => {
    expect(plausibleLags("Digestive Symptom")).toEqual([0, 1, 2]);
    expect(plausibleLags("Pain")).toEqual([0, 1]);
    expect(plausibleLags("Other Symptom")).toEqual([0]);
    expect(plausibleLags("Menstrual")).toEqual([]);
  });
});

describe("check-in outcomes", () => {
  const day = (n: number) => addDaysToDate("2026-03-01", n);

  it("treats 1–2 as low, and only knows days with that rating", () => {
    const [mood, energy] = checkInOutcomes([
      { date: day(0), mood: 2, energy: null, note: "" },
      { date: day(1), mood: 4, energy: 1, note: "" },
    ]);
    expect(mood.label).toBe("Low mood");
    expect([...mood.dates]).toEqual([day(0)]);
    expect(mood.tracked.size).toBe(2);
    expect(energy.label).toBe("Low energy");
    expect(energy.tracked.size).toBe(1);
  });

  it("links low energy to a trigger", () => {
    // Low energy on every Pasta day, and now and then otherwise.
    const events = Array.from({ length: 90 }, (_, n) => [
      makeEvent({ itemType: "food", item: "Bread", category: "Grains", date: day(n) }),
      ...(n % 3 === 0 ? [makeEvent({ itemType: "food", item: "Pasta", category: "Grains", date: day(n) })] : []),
    ]).flat();
    const checkIns = Array.from({ length: 90 }, (_, n) => ({ date: day(n), mood: 3, energy: n % 3 === 0 || n % 10 === 1 ? 2 : 4, note: "" }));
    const links = generateTopPatterns(events, new Set(), [], checkIns);
    expect(links.some((l) => l.outcomeLabel === "Low energy" && l.causeLabel === "Pasta" && l.diffPct > 0)).toBe(true);
  });
});

describe("stoolOutcomes", () => {
  it("tests hard and loose stools out of the days a bowel movement was logged", () => {
    const logs = [
      makeStoolLog({ date: "2026-01-01", bristolScores: [1] }),
      makeStoolLog({ date: "2026-01-02", bristolScores: [4] }),
      makeStoolLog({ date: "2026-01-03", bristolScores: [3, 6] }),
    ];
    const [hard, loose] = stoolOutcomes(logs);
    expect(hard.label).toBe("Hard stool");
    expect(hard.dates).toEqual(new Set(["2026-01-01"]));
    expect(loose.dates).toEqual(new Set(["2026-01-03"]));
    expect(loose.tracked.size).toBe(3);
  });

  it("adds nothing without stool logs", () => {
    expect(stoolOutcomes([])).toEqual([]);
  });
});
