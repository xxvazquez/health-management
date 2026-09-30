import { describe, expect, it } from "vitest";
import { ratedCombos } from "./favouriteCombos";

describe("ratedCombos", () => {
  it("scores recurring combos by their average rating, best first", () => {
    const combos = ratedCombos([
      { items: ["Pumpkin", "Cumin", "Onion"], rating: 5 },
      { items: ["Pumpkin", "Cumin", "Onion", "Carrot"], rating: 4 },
      { items: ["Banana", "Oats"], rating: 2 },
      { items: ["Banana", "Oats"], rating: 3 },
    ]);
    expect(combos[0]).toEqual({ items: ["Cumin", "Onion", "Pumpkin"], average: 4.5, count: 2 });
    expect(combos.at(-1)).toEqual({ items: ["Banana", "Oats"], average: 2.5, count: 2 });
  });

  it("drops a pair when a trio covers the same meals, and ignores one-offs", () => {
    const combos = ratedCombos([
      { items: ["A", "B", "C"], rating: 5 },
      { items: ["A", "B", "C"], rating: 5 },
      { items: ["D", "E"], rating: 5 },
    ]);
    expect(combos.map((c) => c.items.join("+"))).toEqual(["A+B+C"]);
  });

  it("leaves out foods that are in almost everything", () => {
    const occasions = Array.from({ length: 6 }, (_, i) => ({ items: ["Salt", i < 3 ? "Rice" : "Pasta", i < 3 ? "Beans" : "Tomato"], rating: 4 }));
    const combos = ratedCombos(occasions);
    expect(combos.some((c) => c.items.includes("Salt"))).toBe(false);
    expect(combos.map((c) => c.items.join("+"))).toEqual(["Beans+Rice", "Pasta+Tomato"]);
  });
});
