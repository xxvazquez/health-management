import { describe, expect, it } from "vitest";
import { buildStateByDate } from "./adherence";
import { makeEvent } from "@/lib/testFixtures";

describe("buildStateByDate", () => {
  it("returns an empty map when the item was never logged", () => {
    expect(buildStateByDate([], "Vitamin D")).toEqual(new Map());
    expect(buildStateByDate([makeEvent({ item: "Other" })], "Vitamin D")).toEqual(new Map());
  });

  it("marks a day the item was completed", () => {
    const events = [makeEvent({ item: "Vitamin D", date: "2026-01-01", completed: true })];
    expect(buildStateByDate(events, "Vitamin D").get("2026-01-01")).toBe("completed");
  });

  it("marks a day the item was logged but not completed (value 0)", () => {
    const events = [makeEvent({ item: "Vitamin D", date: "2026-01-01", completed: false, value: 0 })];
    expect(buildStateByDate(events, "Vitamin D").get("2026-01-01")).toBe("tracked-not-completed");
  });

  it("marks a gap day (app used, item not logged, after its first occurrence) as tracked-not-completed", () => {
    const events = [
      makeEvent({ item: "Vitamin D", date: "2026-01-01", completed: true }),
      makeEvent({ item: "Other item", date: "2026-01-02" }), // app was used this day, but not for Vitamin D
    ];
    expect(buildStateByDate(events, "Vitamin D").get("2026-01-02")).toBe("tracked-not-completed");
  });

  it("does not include a day before the item's first occurrence, even if the app was used that day", () => {
    const events = [
      makeEvent({ item: "Other item", date: "2026-01-01" }),
      makeEvent({ item: "Vitamin D", date: "2026-01-05", completed: true }),
    ];
    expect(buildStateByDate(events, "Vitamin D").has("2026-01-01")).toBe(false);
  });
});
