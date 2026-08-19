"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card, CardTitle } from "@/components/ui/Card";
import { ItemActions } from "@/components/ui/ItemActions";
import { useItemActions, type ManageableItem } from "@/lib/useItemActions";
import { getAllItems, getAllUserOverrides, putItem, setUserOverride } from "@/lib/db/indexedDb";
import { pushItem, pushUserOverride } from "@/lib/supabase/sync";
import { generateManualItemId } from "@/lib/logCandidates";
import { classifyItem, lookupFoodCategory, type OverrideEntry } from "@/taxonomy/classify";
import { normalizeName } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { RawItem } from "@/lib/types";

const TYPE_SECTIONS: { type: ItemType; label: string; placeholder: string }[] = [
  { type: "food", label: "Food", placeholder: "e.g. Kohlrabi" },
  { type: "supplement", label: "Supplements", placeholder: "e.g. Vitamin B12" },
  { type: "outcome", label: "Symptoms", placeholder: "e.g. Joint pain" },
  { type: "habit", label: "Habits", placeholder: "e.g. Stretch before bed" },
];

function AddItemForm({
  itemType,
  placeholder,
  overrides,
  onAdd,
}: {
  itemType: ItemType;
  placeholder: string;
  overrides: Record<string, OverrideEntry>;
  onAdd: (name: string, category: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const needsCategory = useMemo(() => {
    if (!trimmed) return false;
    const bundled = classifyItem(trimmed, overrides);
    if (bundled.matchedBy !== "fallback") return false;
    if (itemType === "food" && lookupFoodCategory(trimmed)) return false;
    return true;
  }, [trimmed, itemType, overrides]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    await onAdd(trimmed, category);
    setName("");
    setCategory("");
    setBusy(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border px-2.5 py-1.5 text-sm"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {needsCategory && (
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded-md border px-2.5 py-1.5 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        >
          {CATEGORIES_BY_TYPE[itemType].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <button
        type="submit"
        disabled={!trimmed || busy}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        style={{ background: "var(--series-1)" }}
      >
        {busy ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

function ItemRow({
  item,
  busy,
  onArchiveToggle,
  onRename,
}: {
  item: ManageableItem;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (name: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <ItemActions item={item} busy={busy} onArchiveToggle={onArchiveToggle} onRename={onRename} />
      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
        {item.category}
      </span>
    </li>
  );
}

function ItemSection({
  type,
  label,
  placeholder,
  items,
  overrides,
  busyIdentity,
  onToggleArchive,
  onRename,
  onAdd,
}: {
  type: ItemType;
  label: string;
  placeholder: string;
  items: ManageableItem[];
  overrides: Record<string, OverrideEntry>;
  busyIdentity: string | null;
  onToggleArchive: (item: ManageableItem) => void;
  onRename: (item: ManageableItem, name: string) => void;
  onAdd: (name: string, category: string) => Promise<void>;
}) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const active = items.filter((i) => !i.isArchived).sort((a, b) => a.item.localeCompare(b.item));
  const archived = items.filter((i) => i.isArchived).sort((a, b) => a.item.localeCompare(b.item));

  return (
    <Card tier="raw">
      <CardTitle size="sm" subtitle={`${active.length} active${archived.length > 0 ? ` · ${archived.length} archived` : ""}`}>
        {label}
      </CardTitle>
      <div className="mb-4">
        <AddItemForm itemType={type} placeholder={placeholder} overrides={overrides} onAdd={onAdd} />
      </div>
      {active.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing tracked yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--gridline)" }}>
          {active.map((item) => (
            <ItemRow
              key={item.itemIdentity}
              item={item}
              busy={busyIdentity === item.itemIdentity}
              onArchiveToggle={() => onToggleArchive(item)}
              onRename={(name) => onRename(item, name)}
            />
          ))}
        </ul>
      )}
      {archived.length > 0 && (
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            className="text-xs font-medium underline decoration-dotted"
            style={{ color: "var(--text-secondary)" }}
          >
            Archived ({archived.length}) — {archivedOpen ? "Hide" : "Show"}
          </button>
          {archivedOpen && (
            <ul className="mt-2 flex flex-col divide-y opacity-70" style={{ borderColor: "var(--gridline)" }}>
              {archived.map((item) => (
                <ItemRow
                  key={item.itemIdentity}
                  item={item}
                  busy={busyIdentity === item.itemIdentity}
                  onArchiveToggle={() => onToggleArchive(item)}
                  onRename={(name) => onRename(item, name)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ManagePage() {
  const { status, isDemoData, refresh: refreshShared } = useData();
  const [rawItems, setRawItems] = useState<RawItem[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({});

  // Status-neutral: reads whatever's currently in IndexedDB without
  // touching the shared data status, so the effect below can call this on
  // every status change without looping (see next comment).
  const loadLocalSnapshot = useCallback(async () => {
    const [items, userOverrides] = await Promise.all([getAllItems(), getAllUserOverrides()]);
    setRawItems(items.filter((i) => !i.isRemoved));
    setOverrides(userOverrides);
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loads an external system (IndexedDB) on status change, not a React-state sync loop
    void loadLocalSnapshot();
    // Re-loads whenever the shared data status changes (sign-in pull,
    // initial mount). Deliberately calls the status-neutral snapshot
    // loader here, not the mutation-triggering `refresh` below — `refresh`
    // itself calls `refreshShared`, which cycles `status` through
    // "loading" → a terminal state; if this effect called `refresh` (or
    // anything that touches `refreshShared`) it would re-trigger itself on
    // every one of those transitions and loop forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const refresh = useCallback(async () => {
    await loadLocalSnapshot();
    await refreshShared();
  }, [loadLocalSnapshot, refreshShared]);

  const { busyIdentity, toggleArchive, rename } = useItemActions(refresh);

  const itemsByType = useMemo(() => {
    const map: Record<ItemType, ManageableItem[]> = { food: [], supplement: [], outcome: [], habit: [] };
    if (!rawItems) return map;
    for (const it of rawItems) {
      const c = classifyItem(it.rawName, overrides);
      map[c.itemType].push({
        itemIdentity: it.identity,
        item: c.canonicalName,
        category: c.category,
        subcategory: c.subcategory,
        isArchived: it.isArchived,
      });
    }
    return map;
  }, [rawItems, overrides]);

  async function handleAdd(itemType: ItemType, name: string, categoryOverride: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = normalizeName(trimmed);
    const identity = generateManualItemId(key);
    const bundled = classifyItem(trimmed, overrides);
    const needsOverride = bundled.matchedBy === "fallback";
    const guessedCategory = itemType === "food" ? lookupFoodCategory(trimmed) : null;
    const category = needsOverride ? (guessedCategory ?? (categoryOverride || CATEGORIES_BY_TYPE[itemType][0])) : bundled.category;

    if (needsOverride) {
      const override: OverrideEntry = { canonicalName: trimmed, itemType, category, subcategory: category };
      await setUserOverride(key, override);
      void pushUserOverride(key, override);
    }
    const item: RawItem = {
      identity,
      rawName: trimmed,
      unit: null,
      kind: null,
      frequency: null,
      isRemoved: false,
      isArchived: false,
      createdDate: todayLocalISODate(),
    };
    await putItem(item);
    void pushItem(item);
    await refresh();
  }

  if (status === "loading" || rawItems === null) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty" && !isDemoData) return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Manage items
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Add, rename, archive, or unarchive anything you track. Everything here is synced straight to your
          account — the same items table every page reads from, so there&apos;s nowhere else to edit this by hand.
          Archiving hides an item from the Log page and this list&apos;s active section; its full logged history
          stays in every dashboard.
        </p>
      </div>

      {isDemoData ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Sign in to manage your own items — this page has nothing to show while viewing demo data.
        </p>
      ) : (
        TYPE_SECTIONS.map((section) => (
          <ItemSection
            key={section.type}
            type={section.type}
            label={section.label}
            placeholder={section.placeholder}
            items={itemsByType[section.type]}
            overrides={overrides}
            busyIdentity={busyIdentity}
            onToggleArchive={(item) => void toggleArchive(item)}
            onRename={(item, name) => void rename(item, section.type, name)}
            onAdd={(name, category) => handleAdd(section.type, name, category)}
          />
        ))
      )}
    </div>
  );
}
