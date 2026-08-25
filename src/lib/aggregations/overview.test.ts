import { describe, expect, it } from "vitest";
import { computeOverviewInsight, topCrossDomainFindings } from "./overview";
import { makeEvent } from "@/lib/testFixtures";

describe("computeOverviewInsight", () => {
  it("reports insufficientData for no events", () => {
    const insight = computeOverviewInsight([], []);
    expect(insight.insufficientData).toBe(true);
    expect(insight.whatMatters).toEqual([]);
    expect(insight.needsAttention).toEqual([]);
    expect(insight.whatChanged).toEqual([]);
  });

  it("reports insufficientData when fewer than 10 distinct tracked days exist, even with many events", () => {
    // 5 events, but only on a single day — 1 tracked day total.
    const events = Array.from({ length: 5 }, () => makeEvent({ date: "2026-01-01" }));
    expect(computeOverviewInsight(events, []).insufficientData).toBe(true);
  });
});

describe("topCrossDomainFindings", () => {
  it("returns an empty array (not a crash) for no data", () => {
    expect(topCrossDomainFindings([], [])).toEqual([]);
  });

  it("caps results at 4 and never returns two findings with the same cause+outcome pair", () => {
    const events = Array.from({ length: 30 }, (_, i) =>
      makeEvent({ itemType: "food", item: "Dairy", category: "Dairy", date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, completed: true }),
    );
    const findings = topCrossDomainFindings(events, []);
    expect(findings.length).toBeLessThanOrEqual(4);
    const keys = findings.map((f) => `${f.causeLabel}|${f.outcomeLabel}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
