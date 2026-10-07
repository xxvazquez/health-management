import { describe, expect, it } from "vitest";
import { categoryBreakdown, mainCurrency, sameMerchantUncategorised, shiftMonth, totalsByCurrency } from "./expenseReport";
import type { Expense } from "@/lib/supabase/expenses";

function expense(over: Partial<Expense>): Expense {
  return {
    id: Math.random().toString(36),
    spentAt: "2026-10-05T12:00:00Z",
    merchant: "Shop",
    amount: 10,
    share: null,
    currency: "PLN",
    categoryId: null,
    note: null,
    source: "card",
    card: null,
    createdAt: "2026-10-05T12:00:00Z",
    updatedAt: "2026-10-05T12:00:00Z",
    ...over,
  };
}

describe("totalsByCurrency", () => {
  it("counts your share of a split payment and sums cents exactly", () => {
    const list = [expense({ amount: 0.1 }), expense({ amount: 0.2 }), expense({ amount: 148, share: 74 }), expense({ amount: 5, currency: "EUR" })];
    expect(totalsByCurrency(list)).toEqual([
      ["PLN", 74.3],
      ["EUR", 5],
    ]);
  });

  it("takes refunds off", () => {
    expect(totalsByCurrency([expense({ amount: 50 }), expense({ amount: -20 })])).toEqual([["PLN", 30]]);
  });
});

describe("mainCurrency", () => {
  it("is the most used currency, or the fallback when there's nothing", () => {
    expect(mainCurrency([expense({ currency: "EUR" }), expense({}), expense({})], "EUR")).toBe("PLN");
    expect(mainCurrency([], "EUR")).toBe("EUR");
  });
});

describe("categoryBreakdown", () => {
  const food = { id: "food", name: "Food", icon: null, color: null };
  const home = { id: "home", name: "Home", icon: null, color: null };

  it("ranks categories by spend and puts uncategorised (and deleted categories) last", () => {
    const rows = categoryBreakdown(
      [
        expense({ amount: 300, categoryId: null }),
        expense({ amount: 20, categoryId: "food" }),
        expense({ amount: 80, categoryId: "home" }),
        expense({ amount: 5, categoryId: "gone" }),
      ],
      [food, home],
      "PLN",
    );
    expect(rows.map((r) => [r.category?.name ?? null, r.main, r.count])).toEqual([
      ["Home", 80, 1],
      ["Food", 20, 1],
      [null, 305, 2],
    ]);
  });
});

describe("sameMerchantUncategorised", () => {
  it("finds other uncategorised payments at the same merchant, ignoring case", () => {
    const target = expense({ id: "a", merchant: "Żabka" });
    const twin = expense({ id: "b", merchant: " żabka " });
    const done = expense({ id: "c", merchant: "Żabka", categoryId: "food" });
    const other = expense({ id: "d", merchant: "Lidl" });
    expect(sameMerchantUncategorised(target, [target, twin, done, other]).map((e) => e.id)).toEqual(["b"]);
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});
