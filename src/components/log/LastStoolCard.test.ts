import { describe, expect, it } from "vitest";
import { bristolHeadline, lastStoolOnOrBefore } from "./LastStoolCard";
import { makeStoolLog } from "@/lib/testFixtures";

describe("lastStoolOnOrBefore", () => {
  it("picks the latest movement up to the viewed day", () => {
    const morning = makeStoolLog({ date: "2026-01-02", loggedAt: "2026-01-02T07:00:00.000Z" });
    const evening = makeStoolLog({ date: "2026-01-02", loggedAt: "2026-01-02T19:00:00.000Z" });
    const later = makeStoolLog({ date: "2026-01-05", loggedAt: "2026-01-05T08:00:00.000Z" });
    const logs = [evening, later, makeStoolLog({ date: "2026-01-01" }), morning];
    expect(lastStoolOnOrBefore(logs, "2026-01-03")).toBe(evening);
    expect(lastStoolOnOrBefore(logs, "2026-01-05")).toBe(later);
    expect(lastStoolOnOrBefore(logs, "2025-12-31")).toBeNull();
  });
});

describe("bristolHeadline", () => {
  it("names the type and its band", () => {
    expect(bristolHeadline([4])).toBe("Type 4 · Normal");
    expect(bristolHeadline([6, 1, 3])).toBe("Types 6, 1, 3 · Hard, Normal, Loose");
  });
});
