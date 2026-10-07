"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AddRow, CollapsibleManageCard, GROUP_CLS, GROUP_STYLE, SaveFailedNote } from "@/components/manage/ManageSection";
import { ReorderGrip, useManageOrder } from "@/components/manage/Reorder";
import { ManageRow } from "@/components/ui/ManageRow";
import { FormGroup } from "@/components/ui/FormGroup";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CopyRow, Step } from "@/components/ui/ShortcutSetup";
import { customColorValue } from "@/components/ui/customIcons";
import { buildDemoExpenseData } from "@/lib/demoExpenses";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  fetchExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategory,
} from "@/lib/supabase/expenses";
import { deletePhoneToken, fetchPhoneToken, functionAuthHeader, functionEndpoint, regeneratePhoneToken, type PhoneToken } from "@/lib/supabase/phoneTokens";

const FALLBACK_ACCENT = "var(--series-indigo)";
const DEFAULT_ICON = "lucide:receipt";

/** Settings → Expenses: the categories payments are sorted into, in your
 * own order. Deleting one leaves its expenses uncategorised. */
export function ExpensesCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [categories, setCategories] = useState<ExpenseCategory[]>(() => (isDemoData ? buildDemoExpenseData().categories : []));
  const [loading, setLoading] = useState(!isDemoData);
  const [newName, setNewName] = useState("");
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchExpenseCategories()
      .then((rows) => !cancelled && setCategories(rows))
      .catch((err) => console.error("fetchExpenseCategories failed", err))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  async function run(action: () => Promise<void>): Promise<boolean> {
    try {
      await action();
      setSaveFailed(false);
      return true;
    } catch (err) {
      console.error("expense category action failed", err);
      setSaveFailed(true);
      return false;
    }
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setNewName("");
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    if (isDemoData) {
      setCategories((prev) => [...prev, { id: `demo-exp-cat-${Date.now()}`, name, icon: null, color: null }]);
      return;
    }
    const saved = await run(async () => {
      const created = await createExpenseCategory(name);
      setCategories((prev) => [...prev, created]);
    });
    if (!saved) setNewName((current) => current || name);
  }

  async function handleUpdate(id: string, patch: Partial<Omit<ExpenseCategory, "id">>) {
    const current = categories.find((c) => c.id === id);
    if (!current) return;
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    if (!isDemoData) await run(() => updateExpenseCategory(current, patch).then(() => undefined));
  }

  async function handleDelete(id: string) {
    setCategories((prev) => prev.filter((c) => c.id !== id));
    if (!isDemoData) await run(() => deleteExpenseCategory(id));
  }

  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const byName = categories.slice().sort((a, b) => a.name.localeCompare(b.name));
  const order = useManageOrder(
    "expenseCategories",
    byName.map((c) => c.id),
  );
  const byId = new Map(categories.map((c) => [c.id, c]));
  const visible = order.order
    .map((id) => byId.get(id))
    .filter((c): c is ExpenseCategory => !!c && (!isSearching || c.name.toLowerCase().includes(query)));
  if (isSearching && visible.length === 0) return null;

  return (
    <CollapsibleManageCard
      title="Expenses"
      subtitle={loading ? undefined : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}
      forceOpen={isSearching}
      bare
    >
      <AddRow value={newName} onChange={setNewName} onSubmit={handleAdd} placeholder="New category" maxLength={40} label="Add category" />
      {saveFailed && <SaveFailedNote />}
      {loading ? (
        <p className="py-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Loading…
        </p>
      ) : (
        <FormGroup title="Categories" footer="Deleting a category leaves its expenses uncategorised.">
          {!isSearching && categories.length === 0 && (
            <div className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-muted)" }}>
              No categories yet
            </div>
          )}
          {visible.map((c) => (
            <ManageRow
              key={c.id}
              name={c.name}
              maxLength={40}
              rowRef={order.rowRef(c.id)}
              lifted={order.dragging === c.id}
              trailing={isSearching ? undefined : <ReorderGrip drag={order} id={c.id} label={c.name} />}
              appearance={{
                icon: c.icon,
                color: c.color,
                accent: customColorValue(c.color) ?? FALLBACK_ACCENT,
                defaultIcon: DEFAULT_ICON,
                onIconChange: (icon) => void handleUpdate(c.id, { icon }),
                onColorChange: (color) => void handleUpdate(c.id, { color }),
              }}
              onRename={(next) => {
                const name = next.trim();
                if (name) void handleUpdate(c.id, { name });
              }}
              onDelete={() => void handleDelete(c.id)}
            />
          ))}
        </FormGroup>
      )}
    </CollapsibleManageCard>
  );
}

const TOKEN_TABLE = "expense_import_tokens";

function lastPayment(token: PhoneToken | null): string {
  if (!token?.lastUsedAt) return "Not yet";
  return new Date(token.lastUsedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Settings → Expenses → Card payments: an iOS Shortcut that runs on every
 * Apple Pay payment with the card and posts it to the expense-import Edge
 * Function. */
export function CardPaymentsCard({ isDemoData, searchQuery }: { isDemoData: boolean; searchQuery: string }) {
  const [token, setToken] = useState<PhoneToken | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "busy" | "error">("loading");
  const [confirmOff, setConfirmOff] = useState(false);
  const endpoint = functionEndpoint("expense-import");
  const auth = functionAuthHeader();

  useEffect(() => {
    if (isDemoData) return;
    let cancelled = false;
    fetchPhoneToken(TOKEN_TABLE)
      .then((t) => {
        if (cancelled) return;
        setToken(t);
        setState("ready");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [isDemoData]);

  const act = async (fn: () => Promise<PhoneToken | null>) => {
    setState("busy");
    try {
      setToken(await fn());
      setState("ready");
    } catch (err) {
      console.error("card payments token action failed", err);
      setState("error");
    }
  };

  const subtitle = isDemoData || state === "loading" ? undefined : token ? "On" : "Off";
  const link = token && endpoint ? `${endpoint}?token=${encodeURIComponent(token.token)}` : "";

  return (
    <CollapsibleManageCard title="Card payments" subtitle={subtitle} forceOpen={searchQuery.trim().length > 0} bare>
      {isDemoData || !endpoint || !auth ? (
        <FormGroup footer="Sign in to bring Revolut card payments into Expenses.">
          <div className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            Apple Pay payments, as they happen
          </div>
        </FormGroup>
      ) : !token ? (
        <FormGroup footer="Each Apple Pay payment with your Revolut card lands in Notes → Expenses.">
          <button
            type="button"
            onClick={() => void act(() => regeneratePhoneToken(TOKEN_TABLE))}
            disabled={state === "busy" || state === "loading"}
            className="flex min-h-11 w-full items-center px-3.5 text-left text-sm font-medium disabled:opacity-50"
            style={{ color: "var(--ui-accent)" }}
          >
            Set up card payments
          </button>
        </FormGroup>
      ) : (
        <>
          <FormGroup>
            <div className="flex min-h-11 items-center justify-between gap-3 px-3.5 text-sm">
              <span style={{ color: "var(--text-primary)" }}>Last payment</span>
              <span style={{ color: "var(--text-secondary)" }}>{lastPayment(token)}</span>
            </div>
          </FormGroup>

          <FormGroup title="For the shortcut" footer="The link carries your private key. Don't share it.">
            <CopyRow label="Link" value={link} />
            <CopyRow label="Authorization" value={auth} />
          </FormGroup>

          <FormGroup title="On your iPhone" footer="Only Apple Pay payments trigger it. Add online payments and transfers with New expense.">
            <Step n={1}>
              Shortcuts → Automation → + → <strong>Transaction</strong> → pick your Revolut card → Run Immediately.
            </Step>
            <Step n={2}>
              Add <strong>Get Contents of URL</strong> with the Link above, Method POST, header Authorization.
            </Step>
            <Step n={3}>
              Request Body JSON, Text fields: <code>merchant</code> = Shortcut Input › Merchant, <code>amount</code> = Shortcut Input › Amount,{" "}
              <code>card</code> = Shortcut Input › Card or Pass.
            </Step>
          </FormGroup>

          {state === "error" && (
            <p className="px-3.5 text-xs" style={{ color: "var(--status-critical)" }}>
              That didn&apos;t work — try again.
            </p>
          )}

          <div className={GROUP_CLS} style={GROUP_STYLE}>
            <button
              type="button"
              onClick={() => void act(() => regeneratePhoneToken(TOKEN_TABLE))}
              disabled={state === "busy"}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm disabled:opacity-50"
              style={{ color: "var(--ui-accent)" }}
            >
              New key
            </button>
            <button
              type="button"
              onClick={() => setConfirmOff(true)}
              disabled={state === "busy"}
              className="flex min-h-11 w-full items-center px-3.5 text-left text-sm disabled:opacity-50"
              style={{ color: "var(--status-critical)" }}
            >
              Turn off
            </button>
          </div>

          {confirmOff && (
            <ConfirmDialog
              title="Turn off card payments?"
              message="The shortcut stops working. Expenses already saved stay."
              confirmLabel="Turn off"
              destructive
              onConfirm={() => {
                setConfirmOff(false);
                void act(() => deletePhoneToken(TOKEN_TABLE).then(() => null));
              }}
              onClose={() => setConfirmOff(false)}
            />
          )}
        </>
      )}
    </CollapsibleManageCard>
  );
}
