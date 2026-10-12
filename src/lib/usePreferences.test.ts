import { describe, expect, it } from "vitest";
import { applyOrder, applyPrefsChange } from "./usePreferences";

describe("applyOrder", () => {
  it("puts saved keys first in their order, then the rest as they came", () => {
    expect(applyOrder(["a", "b", "c", "d"], ["c", "a"], (x) => x)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores saved keys that no longer exist and keeps the list as is without an order", () => {
    expect(applyOrder(["a", "b"], ["gone", "b"], (x) => x)).toEqual(["b", "a"]);
    expect(applyOrder(["b", "a"], undefined, (x) => x)).toEqual(["b", "a"]);
  });
});

describe("applyPrefsChange", () => {
  it("keeps another device's edits to other entries of the same key", () => {
    const before = { orders: { doctorTypes: ["a"], domains: ["food"] } };
    const after = { orders: { doctorTypes: ["b", "a"], domains: ["food"] } };
    const server = { orders: { doctorTypes: ["a"], domains: ["cycle", "food"] }, defaultTime: "09:00" };
    expect(applyPrefsChange(server, before, after)).toEqual({ orders: { doctorTypes: ["b", "a"], domains: ["cycle", "food"] }, defaultTime: "09:00" });
  });

  it("removes an entry deleted here and sets whole keys that changed", () => {
    const before = { slotTimes: { Lunch: "13:00", Dinner: "19:00" }, defaultTime: "08:00" };
    const after = { slotTimes: { Dinner: "19:00" }, defaultTime: "09:00" };
    const server = { slotTimes: { Lunch: "13:00", Dinner: "20:00" }, defaultTime: "08:00" };
    expect(applyPrefsChange(server, before, after)).toEqual({ slotTimes: { Dinner: "20:00" }, defaultTime: "09:00" });
  });
});
