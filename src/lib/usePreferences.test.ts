import { describe, expect, it } from "vitest";
import { applyOrder } from "./usePreferences";

describe("applyOrder", () => {
  it("puts saved keys first in their order, then the rest as they came", () => {
    expect(applyOrder(["a", "b", "c", "d"], ["c", "a"], (x) => x)).toEqual(["c", "a", "b", "d"]);
  });

  it("ignores saved keys that no longer exist and keeps the list as is without an order", () => {
    expect(applyOrder(["a", "b"], ["gone", "b"], (x) => x)).toEqual(["b", "a"]);
    expect(applyOrder(["b", "a"], undefined, (x) => x)).toEqual(["b", "a"]);
  });
});
