import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";
import { fetchPaged } from "./paged";
import type { CustomAppearance } from "@/components/ui/customIcons";

export interface ExpenseCategory {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

export interface Expense {
  id: string;
  spentAt: string;
  merchant: string;
  /** What was charged. Negative for a refund. */
  amount: number;
  /** Your part of a split payment; null when all of it was yours. */
  share: number | null;
  currency: string;
  categoryId: string | null;
  note: string | null;
  source: "manual" | "card";
  card: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseData {
  categories: ExpenseCategory[];
  expenses: Expense[];
}

interface CategoryRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

interface ExpenseRow {
  id: string;
  spent_at: string;
  merchant: string;
  amount: number | string;
  share: number | string | null;
  currency: string;
  category_id: string | null;
  note: string | null;
  source: "manual" | "card";
  card: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORIES_TABLE = "expense_categories";
const EXPENSES_TABLE = "expenses";
const CATEGORY_COLUMNS = "id, name, icon, color";
const EXPENSE_COLUMNS = "id, spent_at, merchant, amount, share, currency, category_id, note, source, card, created_at, updated_at";

/** The part of an expense that counts toward totals. */
export function myShare(expense: Pick<Expense, "amount" | "share">): number {
  return expense.share ?? expense.amount;
}

function toCategory(row: CategoryRow): ExpenseCategory {
  return { id: row.id, name: row.name, icon: row.icon, color: row.color };
}

function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    spentAt: row.spent_at,
    merchant: row.merchant,
    amount: Number(row.amount),
    share: row.share == null ? null : Number(row.share),
    currency: row.currency,
    categoryId: row.category_id,
    note: row.note,
    source: row.source,
    card: row.card,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function expensePayload(e: Expense, userId: string): Record<string, unknown> {
  return {
    id: e.id,
    user_id: userId,
    spent_at: e.spentAt,
    merchant: e.merchant,
    amount: e.amount,
    share: e.share,
    currency: e.currency,
    category_id: e.categoryId,
    note: e.note,
    source: e.source,
    card: e.card,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new Error("Sign in first.");
  return id;
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase.from(CATEGORIES_TABLE).select(CATEGORY_COLUMNS).eq("user_id", myUserId).order("name");
  if (error) throw error;
  return (data as CategoryRow[]).map(toCategory);
}

/** Every category and expense for the signed-in user, newest first. */
export async function fetchExpenseData(): Promise<ExpenseData> {
  const client = supabase;
  if (!client) return { categories: [], expenses: [] };
  const myUserId = await currentUserId();
  if (!myUserId) return { categories: [], expenses: [] };
  const [categories, rows] = await Promise.all([
    fetchExpenseCategories(),
    fetchPaged<ExpenseRow>((from, to) =>
      client
        .from(EXPENSES_TABLE)
        .select(EXPENSE_COLUMNS)
        .eq("user_id", myUserId)
        .order("spent_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);
  return { categories, expenses: rows.map(toExpense) };
}

export type ExpenseInput = Pick<Expense, "spentAt" | "merchant" | "amount" | "share" | "currency" | "categoryId" | "note">;

export async function createExpense(input: ExpenseInput): Promise<Expense> {
  const myUserId = await requireUserId();
  const nowIso = new Date().toISOString();
  const expense: Expense = { ...input, id: createTimeOrderedId(), source: "manual", card: null, createdAt: nowIso, updatedAt: nowIso };
  await upsertDirect(myUserId, EXPENSES_TABLE, expense.id, expensePayload(expense, myUserId));
  return expense;
}

/** Takes the full current expense so an offline save can still upsert a
 * complete row. */
export async function updateExpense(expense: Expense, patch: Partial<ExpenseInput>): Promise<Expense> {
  const myUserId = await requireUserId();
  const next: Expense = { ...expense, ...patch, updatedAt: new Date().toISOString() };
  await upsertDirect(myUserId, EXPENSES_TABLE, next.id, expensePayload(next, myUserId));
  return next;
}

export async function deleteExpense(id: string): Promise<void> {
  const myUserId = await requireUserId();
  await deleteDirect(myUserId, EXPENSES_TABLE, id);
}

export async function createExpenseCategory(name: string, appearance?: CustomAppearance): Promise<ExpenseCategory> {
  const myUserId = await requireUserId();
  const category: ExpenseCategory = { id: createTimeOrderedId(), name: name.trim(), icon: appearance?.icon ?? null, color: appearance?.color ?? null };
  await upsertDirect(myUserId, CATEGORIES_TABLE, category.id, { ...category, user_id: myUserId });
  return category;
}

export async function updateExpenseCategory(category: ExpenseCategory, patch: Partial<Omit<ExpenseCategory, "id">>): Promise<ExpenseCategory> {
  const myUserId = await requireUserId();
  const next: ExpenseCategory = { ...category, ...patch, name: (patch.name ?? category.name).trim() };
  await upsertDirect(myUserId, CATEGORIES_TABLE, next.id, { ...next, user_id: myUserId });
  return next;
}

/** Its expenses stay, uncategorised (the foreign key sets them to null). */
export async function deleteExpenseCategory(id: string): Promise<void> {
  const myUserId = await requireUserId();
  await deleteDirect(myUserId, CATEGORIES_TABLE, id);
}
