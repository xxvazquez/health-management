import { describe, expect, it } from "vitest";
import { categoryComparator } from "./categoryOrder";
import type { RawCategory } from "./types";

const row = (name: string, sortOrder: number | null = null): RawCategory => ({ id: name, itemType: "food", name, icon: null, color: null, sortOrder });

describe("categoryComparator", () => {
  it("puts arranged categories first, in their order, then the rest A–Z", () => {
    const rows = [row("Veggies", 0), row("Fruit", 1), row("Dairy"), row("Grains")];
    expect(["Grains", "Dairy", "Fruit", "Veggies"].sort(categoryComparator(rows, "food"))).toEqual(["Veggies", "Fruit", "Dairy", "Grains"]);
  });

  it("is plain A–Z when nothing has been arranged", () => {
    const rows = [row("Veggies"), row("Fruit")];
    expect(["Veggies", "Fruit", "Meat"].sort(categoryComparator(rows, "food"))).toEqual(["Fruit", "Meat", "Veggies"]);
  });
});
