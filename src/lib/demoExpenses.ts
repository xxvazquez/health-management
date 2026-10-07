import type { Expense, ExpenseCategory, ExpenseData } from "@/lib/supabase/expenses";

/** Example expenses for signed-out visitors: purely in-memory, anchored to
 * today so the dates always read as recent, never written anywhere. */
const HOUR = 60 * 60 * 1000;

const CATEGORIES: ExpenseCategory[] = [
  { id: "demo-exp-cat-groceries", name: "Groceries", icon: "lucide:shopping-basket", color: "series-1" },
  { id: "demo-exp-cat-eating-out", name: "Eating out", icon: "lucide:utensils", color: "series-4" },
  { id: "demo-exp-cat-transport", name: "Transport", icon: "lucide:tram-front", color: "series-2" },
  { id: "demo-exp-cat-home", name: "Home", icon: "lucide:house", color: "series-indigo" },
  { id: "demo-exp-cat-health", name: "Health", icon: "lucide:heart-pulse", color: "series-berry" },
];

const ROWS: { hoursAgo: number; merchant: string; amount: number; share?: number; category: string | null; card?: boolean }[] = [
  { hoursAgo: 2, merchant: "Corner Bakery", amount: 14.5, category: null, card: true },
  { hoursAgo: 5, merchant: "City Transit", amount: 4.4, category: "demo-exp-cat-transport", card: true },
  { hoursAgo: 26, merchant: "Green Grocer", amount: 62.3, category: "demo-exp-cat-groceries", card: true },
  { hoursAgo: 30, merchant: "Trattoria Sole", amount: 148, share: 74, category: "demo-exp-cat-eating-out", card: true },
  { hoursAgo: 52, merchant: "Pharmacy Plus", amount: 23.99, category: "demo-exp-cat-health", card: true },
  { hoursAgo: 75, merchant: "Hardware Store", amount: 39.9, category: null, card: true },
  { hoursAgo: 4 * 24, merchant: "Green Grocer", amount: 41.15, category: "demo-exp-cat-groceries", card: true },
  { hoursAgo: 6 * 24, merchant: "Electric bill", amount: 210, share: 105, category: "demo-exp-cat-home" },
  { hoursAgo: 9 * 24, merchant: "City Transit", amount: 4.4, category: "demo-exp-cat-transport", card: true },
  { hoursAgo: 12 * 24, merchant: "Noodle Bar", amount: 36, category: "demo-exp-cat-eating-out", card: true },
  { hoursAgo: 35 * 24, merchant: "Green Grocer", amount: 88.6, category: "demo-exp-cat-groceries", card: true },
  { hoursAgo: 38 * 24, merchant: "Electric bill", amount: 196, share: 98, category: "demo-exp-cat-home" },
];

export function buildDemoExpenseData(): ExpenseData {
  const now = Date.now();
  const expenses: Expense[] = ROWS.map((r, i) => {
    const at = new Date(now - r.hoursAgo * HOUR).toISOString();
    return {
      id: `demo-expense-${i}`,
      spentAt: at,
      merchant: r.merchant,
      amount: r.amount,
      share: r.share ?? null,
      currency: "EUR",
      categoryId: r.category,
      note: null,
      source: r.card ? "card" : "manual",
      card: r.card ? "Revolut" : null,
      createdAt: at,
      updatedAt: at,
    };
  });
  return { categories: CATEGORIES.map((c) => ({ ...c })), expenses };
}
