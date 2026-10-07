import { myShare, type Expense, type ExpenseCategory } from "@/lib/supabase/expenses";
import { merchantKey } from "@/lib/money";

/** `YYYY-MM` of a moment in local time. */
export function localMonth(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** `YYYY-MM-DD` of a moment in local time. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${localMonth(iso)}-${String(d.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Your share of each currency, largest first. Cents are summed as
 * integers so totals never drift. */
export function totalsByCurrency(expenses: readonly Expense[]): [string, number][] {
  const cents = new Map<string, number>();
  for (const e of expenses) cents.set(e.currency, (cents.get(e.currency) ?? 0) + Math.round(myShare(e) * 100));
  return [...cents].map(([c, v]) => [c, v / 100] as [string, number]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
}

/** The currency most of these payments are in, else `fallback`. */
export function mainCurrency(expenses: readonly Expense[], fallback: string): string {
  const counts = new Map<string, number>();
  for (const e of expenses) counts.set(e.currency, (counts.get(e.currency) ?? 0) + 1);
  let best = fallback;
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

export interface CategoryTotal {
  /** null = uncategorised. */
  category: ExpenseCategory | null;
  totals: [string, number][];
  /** Your share in the main currency, for ranking and bar length. */
  main: number;
  count: number;
}

/** Each category's share of the month, biggest first; uncategorised last. */
export function categoryBreakdown(expenses: readonly Expense[], categories: readonly ExpenseCategory[], currency: string): CategoryTotal[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map<string | null, Expense[]>();
  for (const e of expenses) {
    const key = e.categoryId && byId.has(e.categoryId) ? e.categoryId : null;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const rows: CategoryTotal[] = [...groups].map(([id, list]) => {
    const totals = totalsByCurrency(list);
    return { category: id ? byId.get(id)! : null, totals, main: totals.find(([c]) => c === currency)?.[1] ?? 0, count: list.length };
  });
  return rows.sort((a, b) => (a.category === null ? 1 : 0) - (b.category === null ? 1 : 0) || b.main - a.main || a.count - b.count);
}

/** Uncategorised payments from the same merchant as `expense` — given the
 * category it was just put in. */
export function sameMerchantUncategorised(expense: Expense, expenses: readonly Expense[]): Expense[] {
  const key = merchantKey(expense.merchant);
  return expenses.filter((e) => e.id !== expense.id && !e.categoryId && merchantKey(e.merchant) === key);
}
