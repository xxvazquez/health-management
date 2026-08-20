"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ItemNameField, ItemActionButtons, useInlineRename } from "@/components/ui/ItemActions";
import { DuplicateItemDialog } from "@/components/ui/DuplicateItemDialog";
import { useItemActions, type ManageableItem } from "@/lib/useItemActions";
import { getAllItems, getAllCategories, putItem, deleteCategoryLocal } from "@/lib/db/indexedDb";
import { pushItem, deleteCategory } from "@/lib/supabase/sync";
import { ensureCategoryId, categoryRowsToSeedForDemo } from "@/lib/categoryResolution";
import { lookupFoodCategory } from "@/taxonomy/classify";
import { normalizeName, titleCaseFallback } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import type { RawItem, RawCategory } from "@/lib/types";

const TYPE_SECTIONS: { type: ItemType; label: string; placeholder: string }[] = [
  { type: "food", label: "Food", placeholder: "e.g. Kohlrabi" },
  { type: "habit", label: "Habits", placeholder: "e.g. Stretch before bed" },
  { type: "supplement", label: "Supplements", placeholder: "e.g. Vitamin B12" },
  { type: "outcome", label: "Symptoms", placeholder: "e.g. Joint pain" },
];

/** Display list for a type's category picker — same rule for all four
 * types, food included. Once this type has any real `categories` rows,
 * those rows ARE the list — full stop, so removing a default sticks
 * instead of reappearing. A type with no rows yet (nothing's ever
 * referenced one of its categories) falls back to the built-in defaults;
 * the first time anything actually uses one (`ensureCategoryId`), the
 * whole default set gets materialized into real rows at once, so this
 * flips from "showing defaults" to "showing rows" without ever narrowing
 * down to just the one category that happened to trigger it. */
function displayCategoryNames(itemType: ItemType, rows: RawCategory[]): string[] {
  const used = rows.filter((r) => r.itemType === itemType).map((r) => r.name);
  if (used.length > 0) return used.sort((a, b) => a.localeCompare(b));
  return [...CATEGORIES_BY_TYPE[itemType]];
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="8.5" cy="8.5" r="5.5" />
      <path d="M16.5 16.5 13 13" />
    </svg>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" style={{ color: "var(--text-muted)" }}>
        <SearchIcon />
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search every item, in every section…"
        className="w-full rounded-md border py-2 pr-9 pl-9 text-sm"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-3 -translate-y-1/2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function AddItemForm({
  itemType,
  placeholder,
  categories,
  onAdd,
}: {
  itemType: ItemType;
  placeholder: string;
  categories: readonly string[];
  onAdd: (name: string, category: string) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  // Food can often guess its own category from the name; every other type
  // has no classifier to guess from, so it always asks.
  const needsCategory = useMemo(() => {
    if (!trimmed) return false;
    if (itemType === "food") return !lookupFoodCategory(trimmed, categories);
    return true;
  }, [trimmed, itemType, categories]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    const added = await onAdd(trimmed, category);
    if (added) {
      setName("");
      setCategory("");
    }
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
          {categories.map((c) => (
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

/** Add/remove which categories a type offers. */
function CategoryManager({
  categories,
  onAddCategory,
  onRemoveCategory,
}: {
  categories: readonly string[];
  onAddCategory: (name: string) => Promise<void>;
  onRemoveCategory: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    await onAddCategory(trimmed);
    setName("");
    setBusy(false);
  }

  return (
    <div className="mb-4 rounded-lg border p-3" style={{ borderColor: "var(--gridline)" }}>
      <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
        Categories
      </p>
      <div className="flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs whitespace-nowrap"
            style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}
          >
            {c}
            <button
              type="button"
              onClick={() => void onRemoveCategory(c)}
              aria-label={`Remove category ${c}`}
              className="leading-none"
              style={{ color: "var(--text-muted)" }}
            >
              ✕
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="mt-2.5 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add a category…"
          className="rounded-md border px-2.5 py-1 text-xs"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
          style={{ color: "var(--text-secondary)" }}
        >
          Add
        </button>
      </form>
    </div>
  );
}

function ItemRow({
  item,
  categories,
  busy,
  onArchiveToggle,
  onRename,
  onChangeCategory,
}: {
  item: ManageableItem;
  categories: readonly string[] | null;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
  onChangeCategory?: (newCategory: string) => void;
}) {
  const renameState = useInlineRename(item, onRename);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <ItemNameField item={item} state={renameState} />
      <span className="flex items-center gap-3">
        <ItemActionButtons item={item} busy={busy} state={renameState} onArchiveToggle={onArchiveToggle} />
        {categories && onChangeCategory ? (
          <select
            value={item.category}
            disabled={busy}
            onChange={(e) => onChangeCategory(e.target.value)}
            className="rounded-md border px-2 py-1 text-xs disabled:opacity-40"
            style={{ borderColor: "var(--border-hairline)", background: "var(--page-plane)", color: "var(--text-secondary)" }}
          >
            {!categories.includes(item.category) && <option value={item.category}>{item.category}</option>}
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {item.category}
          </span>
        )}
      </span>
    </li>
  );
}

function ItemSection({
  itemType,
  label,
  placeholder,
  items,
  categories,
  searchQuery,
  open,
  onToggleOpen,
  busyIdentity,
  onToggleArchive,
  onRename,
  onChangeCategory,
  onAdd,
  onAddCategory,
  onRemoveCategory,
}: {
  itemType: ItemType;
  label: string;
  placeholder: string;
  items: ManageableItem[];
  categories: readonly string[];
  searchQuery: string;
  open: boolean;
  onToggleOpen: () => void;
  busyIdentity: string | null;
  onToggleArchive: (item: ManageableItem) => void;
  onRename: (item: ManageableItem, name: string) => void;
  onChangeCategory: (item: ManageableItem, category: string) => void;
  onAdd: (name: string, category: string) => Promise<boolean>;
  onAddCategory: (name: string) => Promise<void>;
  onRemoveCategory: (name: string) => Promise<void>;
}) {
  const [archivedOpen, setArchivedOpen] = useState(false);
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;
  const matches = (i: ManageableItem) => i.item.toLowerCase().includes(query);

  const active = items
    .filter((i) => !i.isArchived && (!isSearching || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));
  const archived = items
    .filter((i) => i.isArchived && (!isSearching || matches(i)))
    .sort((a, b) => a.item.localeCompare(b.item));

  if (isSearching && active.length === 0 && archived.length === 0) return null;

  const sectionOpen = isSearching ? true : open;
  const archivedSectionOpen = isSearching ? archived.length > 0 : archivedOpen;

  return (
    <Card tier="raw">
      <button type="button" onClick={onToggleOpen} disabled={isSearching} className="flex w-full items-center justify-between gap-3 text-left">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {label}
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {active.length} active{archived.length > 0 ? ` · ${archived.length} archived` : ""}
          </p>
        </div>
        {!isSearching && (
          <span className="shrink-0 text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            {sectionOpen ? "Hide" : "Show"}
          </span>
        )}
      </button>

      {sectionOpen && (
        <div className="mt-4">
          <CategoryManager categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />

          <div className="mb-4">
            <AddItemForm itemType={itemType} placeholder={placeholder} categories={categories} onAdd={onAdd} />
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
                  categories={categories}
                  busy={busyIdentity === item.itemIdentity}
                  onArchiveToggle={() => onToggleArchive(item)}
                  onRename={(name) => onRename(item, name)}
                  onChangeCategory={(category) => onChangeCategory(item, category)}
                />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--gridline)" }}>
              <button
                type="button"
                onClick={() => setArchivedOpen((v) => !v)}
                disabled={isSearching}
                className="text-xs font-medium underline decoration-dotted disabled:opacity-100"
                style={{ color: "var(--text-secondary)" }}
              >
                Archived ({archived.length}) — {archivedSectionOpen ? "Hide" : "Show"}
              </button>
              {archivedSectionOpen && (
                <ul className="mt-2 flex flex-col divide-y opacity-70" style={{ borderColor: "var(--gridline)" }}>
                  {archived.map((item) => (
                    <ItemRow
                      key={item.itemIdentity}
                      item={item}
                      categories={categories}
                      busy={busyIdentity === item.itemIdentity}
                      onArchiveToggle={() => onToggleArchive(item)}
                      onRename={(name) => onRename(item, name)}
                      onChangeCategory={(category) => onChangeCategory(item, category)}
                    />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function toManageable(item: RawItem): ManageableItem {
  return { itemIdentity: item.identity, item: item.rawName, category: item.category, isArchived: item.isArchived };
}

export default function ManagePage() {
  const { status, isDemoData, refresh: refreshShared } = useData();
  const [rawItems, setRawItems] = useState<RawItem[] | null>(null);
  const [categoryRows, setCategoryRows] = useState<RawCategory[]>([]);
  const [openSections, setOpenSections] = useState<Set<ItemType>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [removeCategoryError, setRemoveCategoryError] = useState<string | null>(null);
  // Set when Add matches an existing item's name (active or archived) —
  // surfaced as a dialog instead of silently either creating a duplicate
  // or (for an archived match) failing to sync against the DB's
  // per-user unique-name constraint.
  const [duplicateConflict, setDuplicateConflict] = useState<{ itemType: ItemType; item: ManageableItem } | null>(null);

  // Demo-mode state — purely in-memory, exactly like buildDemoDataset()
  // itself (see its own doc comment): never written to IndexedDB or
  // Supabase, so it's structurally impossible for it to still be there
  // once someone actually signs in. Seeded once (lazy initializer) from
  // the same deterministic demo dataset every other page shows, so
  // there's something real-looking to add/rename/archive/recategorize
  // interactively without an account.
  const [demoItems, setDemoItems] = useState<RawItem[]>(() => buildDemoDataset().items);
  const [demoCategoryRows, setDemoCategoryRows] = useState<RawCategory[]>([]);
  const [demoBusyIdentity, setDemoBusyIdentity] = useState<string | null>(null);

  // Status-neutral: reads whatever's currently in IndexedDB without
  // touching the shared data status, so the effect below can call this on
  // every status change without looping (see next comment).
  const loadLocalSnapshot = useCallback(async () => {
    const [items, categories] = await Promise.all([getAllItems(), getAllCategories()]);
    setRawItems(items);
    setCategoryRows(categories);
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

  const { busyIdentity: realBusyIdentity, toggleArchive: realToggleArchive, rename: realRename, changeCategory: realChangeCategory } =
    useItemActions(refresh);

  const itemsByType = useMemo(() => {
    const map: Record<ItemType, ManageableItem[]> = { food: [], supplement: [], outcome: [], habit: [] };
    const source = isDemoData ? demoItems : rawItems;
    if (!source) return map;
    for (const it of source) map[it.itemType].push(toManageable(it));
    return map;
  }, [isDemoData, demoItems, rawItems]);

  const activeCategoryRows = isDemoData ? demoCategoryRows : categoryRows;

  const categoryNamesByType = useMemo(() => {
    const map = {} as Record<ItemType, string[]>;
    for (const section of TYPE_SECTIONS) map[section.type] = displayCategoryNames(section.type, activeCategoryRows);
    return map;
  }, [activeCategoryRows]);

  function toggleSection(type: ItemType) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleAdd(itemType: ItemType, name: string, categoryChoice: string): Promise<boolean> {
    const trimmed = titleCaseFallback(name);
    if (!trimmed) return false;
    const existing = itemsByType[itemType].find((i) => normalizeName(i.item) === normalizeName(trimmed));
    if (existing) {
      setDuplicateConflict({ itemType, item: existing });
      return false;
    }
    // Food still gets a name-based guess as a convenience; every type falls
    // back to whatever the category picker is showing (its first option by
    // default) if nothing more specific applies.
    const guessed = itemType === "food" ? lookupFoodCategory(trimmed, categoryNamesByType.food) : null;
    const category = guessed ?? (categoryChoice || categoryNamesByType[itemType][0]);
    const categoryId = await ensureCategoryId(itemType, category, categoryRows);

    const item: RawItem = {
      identity: crypto.randomUUID(),
      itemType,
      rawName: trimmed,
      category,
      categoryId,
      isArchived: false,
      createdDate: todayLocalISODate(),
    };
    await putItem(item);
    void pushItem(item);
    await refresh();
    return true;
  }

  async function handleAddCategory(itemType: ItemType, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await ensureCategoryId(itemType, trimmed, categoryRows);
    await refresh();
  }

  async function handleRemoveCategory(itemType: ItemType, name: string) {
    setRemoveCategoryError(null);
    const inUse = itemsByType[itemType].some((i) => i.category === name);
    if (inUse) {
      setRemoveCategoryError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
      return;
    }
    // A never-used built-in default has no row yet to delete — materialize
    // it (and the rest of that type's defaults, same as any other
    // first-ever use) before removing exactly this one, so the removal
    // actually persists instead of the default just reappearing next render.
    const id = await ensureCategoryId(itemType, name, categoryRows);
    await deleteCategoryLocal(id);
    void deleteCategory(id);
    await refresh();
  }

  // --- Demo-mode equivalents of the handlers above — same shapes, but
  // mutating local state instead of IndexedDB/Supabase. See the demo-state
  // declarations up top for why this never touches real storage. ---

  function demoToggleArchive(item: ManageableItem) {
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, isArchived: !it.isArchived } : it)));
    setDemoBusyIdentity(null);
  }

  function demoRename(item: ManageableItem, newName: string) {
    const trimmed = titleCaseFallback(newName);
    if (!trimmed || trimmed === item.item) return;
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, rawName: trimmed } : it)));
    setDemoBusyIdentity(null);
  }

  /** Resolves (materializing whatever's missing, demo-state version of
   * `ensureCategoryId`) a category id, folding the seeded rows into
   * `demoCategoryRows` in the same update. */
  function demoEnsureCategoryId(itemType: ItemType, name: string): string {
    const existing = demoCategoryRows.find((c) => c.itemType === itemType && c.name === name);
    if (existing) return existing.id;
    const seeded = categoryRowsToSeedForDemo(itemType, name, demoCategoryRows);
    setDemoCategoryRows((prev) => [...prev, ...seeded]);
    return seeded.find((c) => c.name === name)?.id ?? seeded[0].id;
  }

  function demoChangeCategory(item: ManageableItem, itemType: ItemType, newCategory: string) {
    if (!newCategory || newCategory === item.category) return;
    setDemoBusyIdentity(item.itemIdentity);
    const categoryId = demoEnsureCategoryId(itemType, newCategory);
    setDemoItems((prev) =>
      prev.map((it) => (it.identity === item.itemIdentity ? { ...it, category: newCategory, categoryId } : it)),
    );
    setDemoBusyIdentity(null);
  }

  function demoHandleAdd(itemType: ItemType, name: string, categoryChoice: string): Promise<boolean> {
    const trimmed = titleCaseFallback(name);
    if (!trimmed) return Promise.resolve(false);
    const existing = itemsByType[itemType].find((i) => normalizeName(i.item) === normalizeName(trimmed));
    if (existing) {
      setDuplicateConflict({ itemType, item: existing });
      return Promise.resolve(false);
    }
    const guessed = itemType === "food" ? lookupFoodCategory(trimmed, categoryNamesByType.food) : null;
    const category = guessed ?? (categoryChoice || categoryNamesByType[itemType][0]);
    const categoryId = demoEnsureCategoryId(itemType, category);
    setDemoItems((prev) => [
      ...prev,
      {
        identity: crypto.randomUUID(),
        itemType,
        rawName: trimmed,
        category,
        categoryId,
        isArchived: false,
        createdDate: todayLocalISODate(),
      },
    ]);
    return Promise.resolve(true);
  }

  function demoAddCategory(itemType: ItemType, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve();
    demoEnsureCategoryId(itemType, trimmed);
    return Promise.resolve();
  }

  function demoRemoveCategory(itemType: ItemType, name: string): Promise<void> {
    setRemoveCategoryError(null);
    if (itemsByType[itemType].some((i) => i.category === name)) {
      setRemoveCategoryError(`"${name}" is still used by at least one ${itemType} item — recategorize those first.`);
      return Promise.resolve();
    }
    // Same materialize-then-remove as the real handler — a never-used
    // default has no row yet, so it has to be seeded before it can be
    // removed, or the removal wouldn't persist.
    const id = demoEnsureCategoryId(itemType, name);
    setDemoCategoryRows((prev) => prev.filter((c) => c.id !== id));
    return Promise.resolve();
  }

  const busyIdentity = isDemoData ? demoBusyIdentity : realBusyIdentity;

  // Only the initial load blanks the whole page — once `rawItems` has
  // loaded at least once, later `status` flickers (every archive/rename/
  // add/category edit here calls `refreshShared`, which cycles status
  // through "loading" and back) must NOT unmount the page again: doing so
  // was what threw the scroll position back to the top on every action.
  // Demo mode never hits this at all — `demoItems` is seeded synchronously.
  if (!isDemoData && rawItems === null) return <p style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (status === "empty" && !isDemoData) return <EmptyState />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Manage items
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          Add, rename, archive, or unarchive anything you track, and manage the category list for Food,
          Supplements, Habits, and Symptoms. Everything here is synced straight to your account — the same tables
          every page reads from, so there&apos;s nowhere else to edit this by hand. Archiving hides an item from
          the Log page and this list&apos;s active section; its full logged history stays in every dashboard.
        </p>
        {isDemoData && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            Example data — try adding, renaming, archiving, and managing categories freely below. None of this is
            saved anywhere; sign in to manage your real items instead.
          </p>
        )}
        {removeCategoryError && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            {removeCategoryError}
          </p>
        )}
      </div>

      <SearchBar value={searchQuery} onChange={setSearchQuery} />
      {TYPE_SECTIONS.map((section) => (
        <ItemSection
          key={section.type}
          itemType={section.type}
          label={section.label}
          placeholder={section.placeholder}
          items={itemsByType[section.type]}
          categories={categoryNamesByType[section.type]}
          searchQuery={searchQuery}
          open={openSections.has(section.type)}
          onToggleOpen={() => toggleSection(section.type)}
          busyIdentity={busyIdentity}
          onToggleArchive={(item) => (isDemoData ? demoToggleArchive(item) : void realToggleArchive(item))}
          onRename={(item, name) => (isDemoData ? demoRename(item, name) : void realRename(item, name))}
          onChangeCategory={(item, category) => {
            if (isDemoData) {
              demoChangeCategory(item, section.type, category);
              return;
            }
            void ensureCategoryId(section.type, category, categoryRows).then((id) => realChangeCategory(item, category, id));
          }}
          onAdd={(name, category) => (isDemoData ? demoHandleAdd(section.type, name, category) : handleAdd(section.type, name, category))}
          onAddCategory={(name) => (isDemoData ? demoAddCategory(section.type, name) : handleAddCategory(section.type, name))}
          onRemoveCategory={(name) => (isDemoData ? demoRemoveCategory(section.type, name) : handleRemoveCategory(section.type, name))}
        />
      ))}

      {duplicateConflict && (
        <DuplicateItemDialog
          name={duplicateConflict.item.item}
          isArchived={duplicateConflict.item.isArchived}
          busy={busyIdentity === duplicateConflict.item.itemIdentity}
          onClose={() => setDuplicateConflict(null)}
          onUnarchive={() => {
            const { item } = duplicateConflict;
            if (isDemoData) demoToggleArchive(item);
            else void realToggleArchive(item);
            setDuplicateConflict(null);
          }}
        />
      )}
    </div>
  );
}
