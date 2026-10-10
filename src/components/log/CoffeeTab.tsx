"use client";

import { CHIP_SM_CLS, chipStyle } from "@/components/ui/Chip";
import { useMemo, useState, type ReactNode } from "react";
import { SearchField } from "@/components/ui/SearchField";
import { TabRail } from "@/components/ui/TabRail";
import { CoffeeLogDialog, type CoffeeLogDraft } from "@/components/log/CoffeeLogDialog";
import type { ResolvedCoffeeOptions } from "@/lib/useCoffeeOptions";
import type { CoffeeItem, CoffeeLog, NewCoffeeItemInput, NewCoffeeLogInput } from "@/lib/supabase/coffee";
import { combineDateAndTime } from "@/lib/logCandidates";
import { FormGroup } from "@/components/ui/FormGroup";
import { ChevronIcon } from "@/components/ui/icons";
import { useToday } from "@/lib/useToday";

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
  const [activeBrand, setActiveBrand] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);
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

  const activeGroup = groupedByBrand.find((g) => g.brand === activeBrand) ?? groupedByBrand[0];

  const usual = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of logs) counts.set(l.itemId, (counts.get(l.itemId) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([itemId]) => active.find((it) => it.id === itemId))
      .filter((it): it is CoffeeItem => !!it);
  }, [logs, active]);

  // Every coffee, archived included, so an older cup still shows its name and opens.
  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const today = useToday();
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

  /** One roast row — icon avatar, name, tasting notes, a chevron to open the
   * log dialog. `bordered` adds the hairline the plain multi-brand accordion
   * needs between rows; the single-brand tab view gets it from `inset-rows`
   * on its wrapper instead. */
  function renderCoffeeRow(it: CoffeeItem, bordered = false): ReactNode {
    return (
      <button
        key={it.id}
        type="button"
        onClick={() => openForNewLog(it)}
        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left ${bordered ? "border-t" : ""}`}
        style={bordered ? { borderColor: "var(--gridline)" } : undefined}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in oklab, ${accent} var(--tint-pct), transparent)`, color: accent }}>
          <CupIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
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
    );
  }

  async function handleAddNew() {
    const name = trimmedSearch;
    if (!name || adding) return;
    if (!active.some((it) => normalizeName(it.name) === normalizeName(name))) {
      setAdding(true);
      try {
        await onAddItem({ name, brand: newBrand, notes: newNotes });
      } finally {
        setAdding(false);
      }
    }
    setNewBrand("");
    setNewNotes("");
    setSearch("");
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
        <div className="flex flex-col gap-1.5">
          <h3 className="px-4 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            New coffee
          </h3>
          <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            <div className="flex min-h-11 items-center gap-3 px-3.5">
              <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                Name
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-sm" style={{ color: "var(--text-secondary)" }}>
                {trimmedSearch}
              </span>
            </div>
            <label className="flex min-h-11 items-center gap-3 px-3.5">
              <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                Brand
              </span>
              <input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Optional"
                className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none"
                style={{ color: "var(--text-secondary)" }}
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 px-3.5">
              <span className="w-16 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                Notes
              </span>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Floral, bright, citrus"
                className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none"
                style={{ color: "var(--text-secondary)" }}
              />
            </label>
            <div className="flex min-h-11 items-center justify-between px-3.5">
              <button type="button" onClick={() => setSearch("")} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                Cancel
              </button>
              <button type="button" onClick={() => void handleAddNew()} disabled={adding} className="min-h-11 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Add coffee
              </button>
            </div>
          </div>
        </div>
      )}

      {usual.length > 0 && items.length > 6 && !trimmedSearch && (
        <div className="flex flex-col gap-1.5">
          <p className="px-0.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Your usual
          </p>
          <div className="no-scrollbar fade-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {usual.map((it) => (
              <button
                key={it.id}
                type="button"
                onClick={() => openForNewLog(it)}
                className={`${CHIP_SM_CLS} shrink-0 whitespace-nowrap`}
                style={chipStyle(false)}
              >
                {it.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {groupedByBrand.length > 1 && !trimmedSearch ? (
        <div className="flex flex-col gap-3">
          <TabRail
            ariaLabel="Coffee brand"
            wrap={false}
            style={{ borderColor: "var(--border-hairline)" }}
            items={groupedByBrand.map((g) => ({ id: g.brand, label: g.brand, accent }))}
            activeId={activeGroup.brand}
            onSelect={setActiveBrand}
            tall
          />
          <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {activeGroup.items.map((it) => renderCoffeeRow(it))}
          </div>
        </div>
      ) : (
        groupedByBrand.length > 0 && (
          <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
            {groupedByBrand.map((group, gi) => (
              <div key={group.brand} className={gi > 0 ? "border-t" : undefined} style={{ borderColor: "var(--gridline)" }}>
                <p className="flex min-h-11 items-center px-3.5 text-sm" style={{ color: "var(--text-primary)" }}>
                  {group.brand}
                  <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
                    {group.items.length}
                  </span>
                </p>
                {group.items.map((it) => renderCoffeeRow(it, true))}
              </div>
            ))}
          </div>
        )
      )}

      {groupedByBrand.length === 0 && !showAddNew && (
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Nothing tracked here yet — search a name above to add your first coffee.
        </p>
      )}

      {todaysLogs.length > 0 && (
        <FormGroup title={date === today ? "Logged today" : "Logged"}>
          {todaysLogs.map((log) => {
            const it = itemById.get(log.itemId);
            const detail = [
              new Date(log.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
              log.cafe,
              log.price != null ? `${log.price} ${currency}` : null,
              log.characteristics.join(", ") || null,
            ].filter(Boolean);
            return (
              <button
                key={log.id}
                type="button"
                onClick={() => openForEdit(log)}
                disabled={pending === log.id}
                className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2 text-left disabled:opacity-50"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {it?.name ?? "Coffee"}
                    {log.brewingMethod && <span style={{ color: "var(--text-secondary)" }}> · {log.brewingMethod}</span>}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {detail.join(" · ")}
                  </span>
                </span>
                <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
                  <ChevronIcon size={14} />
                </span>
              </button>
            );
          })}
        </FormGroup>
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
        onDelete={async () => {
          if (editingLog) await onDeleteLog(editingLog.id);
        }}
      />
    </div>
  );
}
