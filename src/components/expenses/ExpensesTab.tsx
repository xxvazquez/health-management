"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/supabase/AuthContext";
import { useSnapshotCache } from "@/lib/useSnapshotCache";
import { useToday } from "@/lib/useToday";
import { applyOrder, usePreferences } from "@/lib/usePreferences";
import { formatMoney, parseAmountNumber } from "@/lib/money";
import { categoryBreakdown, localDay, localMonth, mainCurrency, sameMerchantUncategorised, shiftMonth, totalsByCurrency } from "@/lib/expenseReport";
import { buildDemoExpenseData } from "@/lib/demoExpenses";
import {
  createExpense,
  deleteExpense,
  fetchExpenseData,
  myShare,
  updateExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseData,
  type ExpenseInput,
} from "@/lib/supabase/expenses";
import { settingsHref } from "@/components/manage/ManageSection";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatGrid";
import { Sheet } from "@/components/ui/Sheet";
import { FormGroup } from "@/components/ui/FormGroup";
import { Field } from "@/components/ui/Field";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { DateTimePicker, MonthPicker } from "@/components/ui/DatePicker";
import { Segmented } from "@/components/ui/Segmented";
import { PickerList } from "@/components/ui/PickerList";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SearchField } from "@/components/ui/SearchField";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { ErrorState, InlineEmpty } from "@/components/ui/EmptyState";
import { CustomIcon, customColorValue } from "@/components/ui/customIcons";
import { ChevronIcon, UpDownChevronIcon } from "@/components/ui/icons";

const TABLES = ["expenses", "expense_categories"] as const;
const ORDER_KEY = "expenseCategories";
const FALLBACK_CURRENCY = "PLN";
const CURRENCIES = ["PLN", "EUR", "GBP", "USD", "CHF", "CZK", "SEK", "NOK", "DKK", "HUF"];
const NO_CATEGORY = "__none";

function categoryAccent(category: ExpenseCategory | null | undefined, fallback: string): string {
  return (category && customColorValue(category.color)) ?? fallback;
}

/** The category's icon on a soft tile of its colour; a muted "?" when
 * the payment has no category yet. */
function CategoryTile({ category, accent }: { category: ExpenseCategory | null; accent: string }) {
  if (!category) {
    return (
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed text-sm"
        style={{ borderColor: "var(--text-muted)", color: "var(--text-muted)" }}
        aria-hidden="true"
      >
        ?
      </span>
    );
  }
  const color = categoryAccent(category, accent);
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
      style={{ color, background: `color-mix(in oklab, ${color} var(--tint-pct), transparent)` }}
      aria-hidden="true"
    >
      <CustomIcon icon={category.icon ?? "lucide:receipt"} size={15} />
    </span>
  );
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  const d = new Date(`${day}T00:00:00`);
  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }) });
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatTotals(totals: [string, number][], currency: string): string {
  if (totals.length === 0) return formatMoney(0, currency);
  return totals.map(([c, v]) => formatMoney(v, c)).join(" · ");
}

/** `YYYY-MM-DDTHH:mm` in local time, as the date-time picker takes it. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function matchesSearch(e: Expense, category: ExpenseCategory | undefined, q: string): boolean {
  return e.merchant.toLowerCase().includes(q) || (e.note ?? "").toLowerCase().includes(q) || (category?.name.toLowerCase().includes(q) ?? false);
}

function ExpenseRow({ expense, category, accent, onOpen }: { expense: Expense; category: ExpenseCategory | null; accent: string; onOpen: () => void }) {
  const split = expense.share !== null;
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left">
      <CategoryTile category={category} accent={accent} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {expense.merchant}
        </span>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {category?.name ?? "No category"} · {timeLabel(expense.spentAt)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="text-sm tabular-nums" style={{ color: myShare(expense) < 0 ? "var(--status-good)" : "var(--text-primary)" }}>
          {formatMoney(myShare(expense), expense.currency)}
        </span>
        {split && (
          <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
            of {formatMoney(expense.amount, expense.currency)}
          </span>
        )}
      </span>
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        <ChevronIcon dir="right" size={14} />
      </span>
    </button>
  );
}

type SplitMode = "all" | "half" | "custom";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function initialSplit(e: Expense | null): SplitMode {
  if (!e || e.share === null) return "all";
  return e.share === round2(e.amount / 2) ? "half" : "custom";
}

/** Add or edit one payment. Opened from "To categorise", it starts on the
 * category list, and picking one saves straight away. */
function ExpenseSheet({
  expense,
  categories,
  defaultCurrency,
  accent,
  startOnCategory,
  onSave,
  onDelete,
  onClose,
}: {
  expense: Expense | null;
  categories: ExpenseCategory[];
  defaultCurrency: string;
  accent: string;
  startOnCategory: boolean;
  onSave: (input: ExpenseInput) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const titleId = useId();
  const [merchant, setMerchant] = useState(expense?.merchant ?? "");
  const [amountText, setAmountText] = useState(expense ? expense.amount.toFixed(2) : "");
  const [currency, setCurrency] = useState(expense?.currency ?? defaultCurrency);
  const [split, setSplit] = useState<SplitMode>(() => initialSplit(expense));
  const [shareText, setShareText] = useState(expense?.share != null ? expense.share.toFixed(2) : "");
  const [categoryId, setCategoryId] = useState<string | null>(expense?.categoryId ?? null);
  const [when, setWhen] = useState(() => toLocalInput(expense?.spentAt ?? new Date().toISOString()));
  const [note, setNote] = useState(expense?.note ?? "");
  const [picking, setPicking] = useState(startOnCategory);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const amount = parseAmountNumber(amountText);
  const customShare = parseAmountNumber(shareText);
  const share = split === "all" || amount === null ? null : split === "half" ? round2(amount / 2) : customShare;
  const shareValid = split !== "custom" || (customShare !== null && amount !== null && Math.abs(customShare) <= Math.abs(amount));
  const canSave = merchant.trim().length > 0 && amount !== null && amount !== 0 && shareValid && !!when && !saving;
  const category = categories.find((c) => c.id === categoryId) ?? null;
  const currencyOptions = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];

  async function save(patch?: Partial<ExpenseInput>) {
    if (amount === null) return;
    setSaving(true);
    setError(false);
    try {
      await onSave({
        merchant: merchant.trim().replace(/\s+/g, " "),
        amount,
        share,
        currency,
        categoryId,
        spentAt: new Date(when).toISOString(),
        note: note.trim() || null,
        ...patch,
      });
    } catch (err) {
      console.error("expense save failed", err);
      setError(true);
      setSaving(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (canSave) void save();
  }

  if (picking) {
    const options = [
      { value: NO_CATEGORY, label: "No category" },
      ...categories.map((c) => ({ value: c.id, label: c.name, group: "Categories" })),
    ];
    return (
      <Sheet
        title={startOnCategory ? (expense?.merchant ?? "Category") : "Category"}
        titleId={titleId}
        onClose={onClose}
        back={startOnCategory ? undefined : { label: expense ? "Expense" : "New expense", onClick: () => setPicking(false) }}
      >
        <div className="flex flex-col gap-4">
          {startOnCategory && expense && (
            <p className="px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
              {formatMoney(myShare(expense), expense.currency)} · {dayLabel(localDay(expense.spentAt), localDay(new Date().toISOString()))}, {timeLabel(expense.spentAt)}
            </p>
          )}
          <PickerList
            options={options}
            isSelected={(v) => (v === NO_CATEGORY ? categoryId === null : v === categoryId)}
            onPick={(v) => {
              const next = v === NO_CATEGORY ? null : v;
              setCategoryId(next);
              if (startOnCategory) {
                if (!saving) void save({ categoryId: next });
              } else {
                setPicking(false);
              }
            }}
            placeholder="Search categories"
            accent={accent}
          />
          {startOnCategory && (
            <FormGroup>
              <button type="button" onClick={() => setPicking(false)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium" style={{ color: accent }}>
                Edit details or split
              </button>
            </FormGroup>
          )}
          <Link href={settingsHref("Expenses")} className="px-3.5 text-sm font-medium" style={{ color: accent }}>
            Edit categories
          </Link>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={expense ? "Expense" : "New expense"}
      titleId={titleId}
      onClose={onClose}
      form={{ onSubmit: submit, submitLabel: expense ? "Done" : "Add", submitDisabled: !canSave, busy: saving, accent }}
    >
      <div className="flex flex-col gap-4">
        <FormGroup footer={expense?.source === "card" ? `Added from ${expense.card ?? "your card"}.` : undefined}>
          <Field label="Merchant">
            <input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="Where you paid"
              maxLength={200}
              autoFocus={!expense}
              className={ROW_TEXT_CLS}
              style={ROW_STYLE}
            />
          </Field>
          <div className="flex min-h-11 items-center gap-3 px-3.5">
            <label htmlFor={`${titleId}-amount`} className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              Charged
            </label>
            <input
              id={`${titleId}-amount`}
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={`${ROW_INLINE_CLS} w-28`}
              style={ROW_STYLE}
            />
            <label className="relative flex shrink-0 items-center gap-0.5 text-sm" style={{ color: accent }}>
              {currency}
              <UpDownChevronIcon size={10} />
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0">
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" onClick={() => setPicking(true)} className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left">
            <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
              Category
            </span>
            <span className="text-sm" style={{ color: category ? categoryAccent(category, accent) : "var(--text-muted)" }}>
              {category?.name ?? "None"}
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              <ChevronIcon dir="right" size={14} />
            </span>
          </button>
        </FormGroup>

        <FormGroup
          title="Your share"
          footer={
            share !== null && amount !== null && shareValid
              ? `Counts as ${formatMoney(share, currency)} of ${formatMoney(amount, currency)}.`
              : split === "custom" && !shareValid && shareText
                ? "Your share can't be more than was charged."
                : undefined
          }
        >
          <div className="px-3.5 py-2">
            <Segmented
              fill
              value={split}
              onChange={setSplit}
              accent={accent}
              options={[
                ["all", "All mine"],
                ["half", "Half"],
                ["custom", "Custom"],
              ]}
            />
          </div>
          {split === "custom" && (
            <Field label="Mine" inline>
              <input
                value={shareText}
                onChange={(e) => setShareText(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                aria-label="Your share"
                className={`${ROW_INLINE_CLS} w-28`}
                style={ROW_STYLE}
              />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {currency}
              </span>
            </Field>
          )}
        </FormGroup>

        <FormGroup>
          <Field label="Date" inline>
            <DateTimePicker value={when} onChange={setWhen} max={localDay(new Date().toISOString())} title="Paid on" />
          </Field>
          <Field label="Note">
            <AutoGrowTextarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={1}
              maxRows={6}
              placeholder="Optional"
              maxLength={1000}
              className={`${ROW_TEXT_CLS} resize-none`}
              style={ROW_STYLE}
            />
          </Field>
        </FormGroup>

        {error && (
          <p className="px-3.5 text-xs" style={{ color: "var(--status-critical)" }}>
            Couldn&apos;t save that — try again in a moment.
          </p>
        )}

        {onDelete && (
          <FormGroup>
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex min-h-11 w-full items-center px-3.5 text-left text-sm" style={{ color: "var(--status-critical)" }}>
              Delete expense
            </button>
          </FormGroup>
        )}
      </div>
      {confirmDelete && onDelete && (
        <ConfirmDialog
          title="Delete this expense?"
          message="It comes off this month's totals. This can't be undone."
          confirmLabel="Delete"
          destructive
          onConfirm={() => {
            setConfirmDelete(false);
            void onDelete();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Sheet>
  );
}

type Editing = { expense: Expense | null; quick: boolean } | null;

/** Notes → Expenses: a month's spending by category, the payments still
 * waiting for a category, and every payment, newest first. */
export function ExpensesTab({ isDemoData, accent }: { isDemoData: boolean; accent: string }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const today = useToday();
  const { prefs } = usePreferences();
  const [data, setData] = useState<ExpenseData>(() => (isDemoData ? buildDemoExpenseData() : { categories: [], expenses: [] }));
  const [loading, setLoading] = useState(() => !isDemoData);
  const [loadError, setLoadError] = useState(false);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState<Editing>(null);

  const [knownIsDemoData, setKnownIsDemoData] = useState(isDemoData);
  if (isDemoData !== knownIsDemoData) {
    setKnownIsDemoData(isDemoData);
    setLoading(!isDemoData);
    setData(isDemoData ? buildDemoExpenseData() : { categories: [], expenses: [] });
  }

  const { persist } = useSnapshotCache<ExpenseData>({
    feature: "expenses",
    tables: TABLES,
    userId,
    isDemo: isDemoData,
    seeded: false,
    fetcher: fetchExpenseData,
    apply: (bundle) => {
      setData(bundle);
      setLoadError(false);
    },
    onSettled: () => setLoading(false),
    onError: () => setLoadError(true),
  });

  useEffect(() => {
    if (!isDemoData && userId && !loading) persist(data);
  }, [data, isDemoData, userId, loading, persist]);

  const categories = useMemo(
    () =>
      applyOrder(
        [...data.categories].sort((a, b) => a.name.localeCompare(b.name)),
        prefs.orders?.[ORDER_KEY],
        (c) => c.id,
      ),
    [data.categories, prefs.orders],
  );
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryOf = (e: Expense) => (e.categoryId ? (categoryById.get(e.categoryId) ?? null) : null);

  const latestCurrency = data.expenses[0]?.currency ?? FALLBACK_CURRENCY;
  const monthExpenses = useMemo(() => data.expenses.filter((e) => localMonth(e.spentAt) === month), [data.expenses, month]);
  const currency = mainCurrency(monthExpenses, latestCurrency);
  const breakdown = useMemo(() => categoryBreakdown(monthExpenses, categories, currency), [monthExpenses, categories, currency]);
  const monthTotals = totalsByCurrency(monthExpenses);
  const biggest = Math.max(1, ...breakdown.map((r) => Math.abs(r.main)));
  const toCategorise = data.expenses.filter((e) => !categoryOf(e));

  const q = search.trim().toLowerCase();
  const listed = q
    ? data.expenses.filter((e) => matchesSearch(e, categoryOf(e) ?? undefined, q))
    : filter === undefined
      ? monthExpenses
      : monthExpenses.filter((e) => (categoryOf(e)?.id ?? null) === filter);
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: Expense[] }[] = [];
    for (const e of [...listed].sort((a, b) => b.spentAt.localeCompare(a.spentAt))) {
      const key = q ? localMonth(e.spentAt) : localDay(e.spentAt);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(e);
      else out.push({ key, label: q ? monthLabel(key) : dayLabel(key, today), items: [e] });
    }
    return out;
  }, [listed, q, today]);

  function replace(next: Expense[]) {
    const byId = new Map(next.map((e) => [e.id, e]));
    setData((d) => {
      const kept = d.expenses.map((e) => byId.get(e.id) ?? e);
      const added = next.filter((e) => !d.expenses.some((x) => x.id === e.id));
      return { ...d, expenses: [...added, ...kept].sort((a, b) => b.spentAt.localeCompare(a.spentAt)) };
    });
  }

  async function handleSave(current: Expense | null, input: ExpenseInput) {
    const nowIso = new Date().toISOString();
    const saved = isDemoData
      ? current
        ? { ...current, ...input, updatedAt: nowIso }
        : { ...input, id: `demo-expense-${Date.now()}`, source: "manual" as const, card: null, createdAt: nowIso, updatedAt: nowIso }
      : current
        ? await updateExpense(current, input)
        : await createExpense(input);
    const changed = [saved];
    // Putting a merchant in a category for the first time sorts its other
    // waiting payments too; new ones from it get the same category.
    if (input.categoryId && !current?.categoryId) {
      for (const twin of sameMerchantUncategorised(saved, data.expenses)) {
        const patch = { categoryId: input.categoryId };
        changed.push(isDemoData ? { ...twin, ...patch, updatedAt: nowIso } : await updateExpense(twin, patch));
      }
    }
    replace(changed);
    setEditing(null);
  }

  async function handleDelete(id: string) {
    setEditing(null);
    setData((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) }));
    if (isDemoData) return;
    try {
      await deleteExpense(id);
    } catch (err) {
      console.error("deleteExpense failed", err);
      fetchExpenseData()
        .then(setData)
        .catch((e) => console.error("fetchExpenseData failed", e));
    }
  }

  const filterLabel = filter === undefined ? null : filter === null ? "No category" : (categoryById.get(filter)?.name ?? null);

  const summary = (
    <Card padded={false} className="p-4">
      <dl className="grid grid-cols-2 gap-x-4">
        <Stat label={`Spent in ${new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long" })}`} value={formatTotals(monthTotals, currency)} />
        <Stat label="Payments" value={String(monthExpenses.length)} />
      </dl>
      {breakdown.length > 0 && (
        <ul className="-mx-2 mt-4 flex flex-col">
          {breakdown.map((row) => {
            const key = row.category?.id ?? null;
            const selected = filter !== undefined && filter === key;
            const color = row.category ? categoryAccent(row.category, accent) : "var(--text-muted)";
            return (
              <li key={key ?? "none"}>
                <button
                  type="button"
                  onClick={() => setFilter(selected ? undefined : key)}
                  aria-pressed={selected}
                  className="flex min-h-11 w-full flex-col justify-center gap-1 rounded-[10px] px-2 py-1.5 text-left"
                  style={{ background: selected ? `color-mix(in oklab, ${accent} var(--tint-pct), transparent)` : undefined }}
                >
                  <span className="flex items-center gap-2.5">
                    <CategoryTile category={row.category} accent={accent} />
                    <span className="min-w-0 flex-1 text-sm" style={{ color: selected ? accent : "var(--text-primary)" }}>
                      {row.category?.name ?? "No category"}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums" style={{ color: "var(--text-primary)" }}>
                      {formatTotals(row.totals, currency)}
                    </span>
                  </span>
                  <span className="ml-[2.375rem] block h-1 rounded-full" style={{ background: "var(--segment-track)" }}>
                    <span className="block h-1 rounded-full" style={{ width: `${Math.max(2, (Math.abs(row.main) / biggest) * 100)}%`, background: color }} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="control-surface flex h-9 shrink-0 items-center rounded-[10px]">
          <button
            type="button"
            onClick={() => {
              setMonth((m) => shiftMonth(m, -1));
              setFilter(undefined);
            }}
            aria-label="Previous month"
            className="hit-slop flex h-9 w-10 items-center justify-center rounded-[10px]"
            style={{ color: accent }}
          >
            <ChevronIcon dir="left" size={15} />
          </button>
          <MonthPicker
            value={month}
            onChange={(m) => {
              setMonth(m);
              setFilter(undefined);
            }}
            max={today.slice(0, 7)}
            title="Month"
            renderTrigger={(open, display) => (
              <button type="button" onClick={open} aria-label="Pick a month" className="flex h-9 min-w-20 shrink-0 items-center justify-center rounded-lg px-1.5">
                <span className="text-sm font-medium whitespace-nowrap" style={{ color: "var(--text-primary)" }}>
                  {display}
                </span>
              </button>
            )}
          />
          <button
            type="button"
            onClick={() => {
              setMonth((m) => shiftMonth(m, 1));
              setFilter(undefined);
            }}
            disabled={month >= today.slice(0, 7)}
            aria-label="Next month"
            className="hit-slop flex h-9 w-10 items-center justify-center rounded-[10px] disabled:opacity-30"
            style={{ color: accent }}
          >
            <ChevronIcon dir="right" size={15} />
          </button>
        </div>
        <SearchField value={search} onChange={setSearch} placeholder="Search expenses…" className="order-last w-full sm:order-none sm:w-56" />
        <div className="ml-auto">
          <PrimaryAction label="New expense" accent={accent} onClick={() => setEditing({ expense: null, quick: false })} />
        </div>
      </div>

      {loading ? (
        <ListSkeleton />
      ) : loadError ? (
        <ErrorState what="your expenses" />
      ) : (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
          {toCategorise.length > 0 && !q && (
            <section className="flex flex-col gap-1.5 lg:col-start-2 lg:row-start-1">
              <h3 className="px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                To categorise · {toCategorise.length}
              </h3>
              <div className="inset-rows rounded-xl border [--row-inset:3.375rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                {toCategorise.map((e) => (
                  <ExpenseRow key={e.id} expense={e} category={null} accent={accent} onOpen={() => setEditing({ expense: e, quick: true })} />
                ))}
              </div>
            </section>
          )}

          {!q && <aside className="lg:sticky lg:top-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">{summary}</aside>}

          <div className="flex flex-col gap-4 lg:col-start-2">
            {filterLabel && !q && (
              <div className="flex items-center justify-between px-3.5">
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {filterLabel}
                </span>
                <button type="button" onClick={() => setFilter(undefined)} className="hit-slop text-sm font-medium" style={{ color: accent }}>
                  Show all
                </button>
              </div>
            )}
            {groups.length === 0 ? (
              <InlineEmpty
                title={q ? "Nothing matches that search" : data.expenses.length === 0 ? "No expenses yet" : `Nothing in ${monthLabel(month)}`}
                description={
                  q
                    ? "Try a different search term."
                    : data.expenses.length === 0
                      ? "Card payments arrive here once the Revolut shortcut is set up in Settings, or tap New expense."
                      : undefined
                }
              />
            ) : (
              groups.map((g) => (
                <section key={g.key} className="flex flex-col gap-1.5">
                  <h3 className="flex items-baseline justify-between px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                    <span>{g.label}</span>
                    <span className="font-normal tabular-nums normal-case">{formatTotals(totalsByCurrency(g.items), currency)}</span>
                  </h3>
                  <div className="inset-rows rounded-xl border [--row-inset:3.375rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
                    {g.items.map((e) => (
                      <ExpenseRow key={e.id} expense={e} category={categoryOf(e)} accent={accent} onOpen={() => setEditing({ expense: e, quick: false })} />
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      )}

      {editing && (
        <ExpenseSheet
          key={editing.expense?.id ?? "new"}
          expense={editing.expense}
          categories={categories}
          defaultCurrency={latestCurrency}
          accent={accent}
          startOnCategory={editing.quick}
          onSave={(input) => handleSave(editing.expense, input)}
          onDelete={editing.expense ? () => handleDelete(editing.expense!.id) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

