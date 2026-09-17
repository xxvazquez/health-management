"use client";

import { useMemo, useState } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";
import { CoffeeLogDialog, type CoffeeLogDraft } from "@/components/log/CoffeeLogDialog";
import type { ResolvedCoffeeOptions } from "@/lib/useCoffeeOptions";
import type { CoffeeItem, CoffeeLog, NewCoffeeItemInput, NewCoffeeLogInput } from "@/lib/supabase/coffee";
import { combineDateAndTime } from "@/lib/logCandidates";

/** What the dialog's draft plus the page's own date/time resolve to — the
 * caller (log/page.tsx) fills in `itemId`/`date` since only it knows which
 * coffee and which day is being logged. */
export type CoffeeLogSubmission = Omit<NewCoffeeLogInput, "itemId" | "date">;

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function CupIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h10v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8Z" />
      <path d="M14 9h1.5a1.5 1.5 0 0 1 0 3H14" />
      <path d="M5 5.5h8" />
    </svg>
  );
}

export function CoffeeTab({
  items,
  logs,
  options,
  currency,
  date,
  accent,
  isDemoData,
  onAddItem,
  onSaveLog,
  onUpdateLog,
  onDeleteLog,
}: {
  items: CoffeeItem[];
  logs: CoffeeLog[];
  options: ResolvedCoffeeOptions;
  currency: string;
  date: string;
  accent: string;
  isDemoData: boolean;
  onAddItem: (input: NewCoffeeItemInput) => Promise<CoffeeItem>;
  onSaveLog: (itemId: string, submission: CoffeeLogSubmission) => Promise<void>;
  onUpdateLog: (id: string, itemId: string, submission: CoffeeLogSubmission) => Promise<void>;
  onDeleteLog: (id: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [dialogItem, setDialogItem] = useState<CoffeeItem | null>(null);
  const [editingLog, setEditingLog] = useState<CoffeeLog | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const active = useMemo(() => items.filter((it) => !it.isArchived), [items]);

  const trimmedSearch = search.trim();
  const filtered = useMemo(() => {
    if (!trimmedSearch) return active;
    const q = normalizeName(trimmedSearch);
    return active.filter((it) => normalizeName(it.name).includes(q) || (it.brand && normalizeName(it.brand).includes(q)));
  }, [active, trimmedSearch]);

  const hasExactMatch = active.some((it) => normalizeName(it.name) === normalizeName(trimmedSearch));
  const showAddNew = trimmedSearch.length > 0 && !hasExactMatch;

  const groupedByBrand = useMemo(() => {
    const byBrand = new Map<string, CoffeeItem[]>();
    for (const it of filtered) {
      const key = it.brand ?? "Other";
      const list = byBrand.get(key) ?? [];
      list.push(it);
      byBrand.set(key, list);
    }
    return [...byBrand.entries()]
      .map(([brand, list]) => ({ brand, items: [...list].sort((a, b) => a.name.localeCompare(b.name)) }))
      .sort((a, b) => (a.brand === "Other" ? 1 : b.brand === "Other" ? -1 : a.brand.localeCompare(b.brand)));
  }, [filtered]);

  const usual = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of logs) counts.set(l.itemId, (counts.get(l.itemId) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([itemId]) => active.find((it) => it.id === itemId))
      .filter((it): it is CoffeeItem => !!it);
  }, [logs, active]);

  const itemById = useMemo(() => new Map(active.map((it) => [it.id, it])), [active]);
  const todaysLogs = useMemo(() => logs.filter((l) => l.date === date).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt)), [logs, date]);

  function openForNewLog(item: CoffeeItem) {
    setEditingLog(null);
    setDialogItem(item);
  }

  function openForEdit(log: CoffeeLog) {
    const item = itemById.get(log.itemId);
    if (!item) return;
    setEditingLog(log);
    setDialogItem(item);
  }

  async function handleAddNew() {
    const name = trimmedSearch;
    if (!name) return;
    const existing = active.find((it) => normalizeName(it.name) === normalizeName(name));
    const item = existing ?? (await onAddItem({ name, brand: newBrand, notes: newNotes }));
    setNewBrand("");
    setNewNotes("");
    setSearch("");
    openForNewLog(item);
  }

  async function handleDialogSave(draft: CoffeeLogDraft) {
    if (!dialogItem) return;
    const submission: CoffeeLogSubmission = {
      loggedAt: combineDateAndTime(date, draft.loggedAtTime),
      cafe: draft.cafe,
      price: draft.price,
      brewingType: draft.brewingType,
      brewingMethod: draft.brewingMethod,
      waterTempC: draft.waterTempC,
      characteristics: draft.characteristics,
      note: draft.note,
    };
    if (editingLog) {
      setPending(editingLog.id);
      await onUpdateLog(editingLog.id, dialogItem.id, submission);
      setPending(null);
    } else {
      await onSaveLog(dialogItem.id, submission);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchField value={search} onChange={setSearch} placeholder="Search or add coffee…" className="w-full" />

      {showAddNew && (
        <div className="flex flex-col gap-3 rounded-xl border p-4" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            No match — add &ldquo;{trimmedSearch}&rdquo;?
          </p>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLS} style={LABEL_STYLE}>
              Brand <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </span>
            <input value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={LABEL_CLS} style={LABEL_STYLE}>
              Coffee notes <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </span>
            <input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Floral, bright, citrus" className={FIELD_CLS} style={FIELD_STYLE} />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleAddNew()}
              className="rounded-md px-3.5 py-1.5 text-sm font-medium whitespace-nowrap text-white"
              style={{ background: accent }}
            >
              + Add &amp; log
            </button>
            <button type="button" onClick={() => setSearch("")} className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {usual.length > 0 && !trimmedSearch && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Your usual
          </p>
          <div className="no-scrollbar fade-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {usual.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => openForNewLog(it)}
                className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs whitespace-nowrap"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
              >
                {it.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {groupedByBrand.length > 0 && (
        <div className="rounded-2xl border shadow-[var(--shadow-card)] overflow-hidden" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
          {groupedByBrand.map((group, gi) => (
            <div key={group.brand} className={gi > 0 ? "border-t" : undefined} style={{ borderColor: "var(--border-hairline)" }}>
              <p className="px-3.5 pt-3 pb-1 text-[11px] font-bold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                {group.brand}
              </p>
              {group.items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => openForNewLog(it)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left border-t first:border-t-0"
                  style={{ borderColor: "var(--border-hairline)" }}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in oklab, ${accent} 14%, var(--surface-1))`, color: accent }}>
                    <CupIcon />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {it.name}
                    </span>
                    {it.notes && (
                      <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                        {it.notes}
                      </span>
                    )}
                  </span>
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-muted)" }}>
                    <path d="M7.5 5 12.5 10 7.5 15" />
                  </svg>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {groupedByBrand.length === 0 && !showAddNew && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing tracked here yet — search a name above to add your first coffee.
        </p>
      )}

      {todaysLogs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Logged today
          </p>
          <div className="flex flex-col gap-2">
            {todaysLogs.map((log) => {
              const it = itemById.get(log.itemId);
              const busy = pending === log.id;
              return (
                <div
                  key={log.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5"
                  style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                      {it?.name ?? "Coffee"}
                      {log.brewingMethod && (
                        <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>
                          · {log.brewingMethod}
                        </span>
                      )}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {new Date(log.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      {log.cafe && ` · ${log.cafe}`}
                      {log.price != null && ` · ${log.price} ${currency}`}
                    </span>
                    {log.characteristics.length > 0 && (
                      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        {log.characteristics.join(", ")}
                      </span>
                    )}
                  </div>
                  {!isDemoData && (
                    <div className="flex shrink-0 items-center gap-2.5">
                      <button type="button" onClick={() => openForEdit(log)} disabled={busy} className="text-xs font-medium disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteLog(log.id)}
                        disabled={busy}
                        aria-label="Delete entry"
                        className="text-xs font-medium disabled:opacity-40"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CoffeeLogDialog
        open={dialogItem !== null}
        onClose={() => {
          setDialogItem(null);
          setEditingLog(null);
        }}
        item={dialogItem}
        options={options}
        currency={currency}
        editingLog={editingLog}
        accent={accent}
        isDemoData={isDemoData}
        onSave={handleDialogSave}
      />
    </div>
  );
}
