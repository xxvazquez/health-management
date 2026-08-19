"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useData } from "@/lib/DataContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { ItemActions } from "@/components/ui/ItemActions";
import { useItemActions, type ManageableItem } from "@/lib/useItemActions";
import { getAllItems, getAllUserOverrides, getAllUserCategories, putItem, setUserOverride, putUserCategory } from "@/lib/db/indexedDb";
import { pushItem, pushUserOverride, pushUserCategory, deleteUserCategory } from "@/lib/supabase/sync";
import { generateManualItemId } from "@/lib/logCandidates";
import { classifyItem, lookupFoodCategory, type OverrideEntry } from "@/taxonomy/classify";
import { normalizeName } from "@/taxonomy/normalizeName";
import { CATEGORIES_BY_TYPE, effectiveCategoryList, type ItemType } from "@/taxonomy/categories";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { buildDemoDataset } from "@/lib/demoData";
import type { RawItem, RawUserCategory } from "@/lib/types";

/** The category list a type should have after one add/remove — materializes
 * the built-in defaults on the first-ever customization (so "remove one
 * default" doesn't just delete a row that was never written), a no-op list
 * change is left untouched. Pure, shared by the real (IndexedDB/Supabase)
 * and demo (in-memory) category-edit paths below. */
function nextCategoryNames(itemType: ItemType, current: string[], op: { kind: "add" | "remove"; name: string }): string[] {
  const base = current.length > 0 ? current : [...CATEGORIES_BY_TYPE[itemType]];
  if (op.kind === "add") return base.includes(op.name) ? base : [...base, op.name];
  return base.filter((c) => c !== op.name);
}

const TYPE_SECTIONS: { type: ItemType; label: string; placeholder: string }[] = [
  { type: "food", label: "Food", placeholder: "e.g. Kohlrabi" },
  { type: "habit", label: "Habits", placeholder: "e.g. Stretch before bed" },
  { type: "supplement", label: "Supplements", placeholder: "e.g. Vitamin B12" },
  { type: "outcome", label: "Symptoms", placeholder: "e.g. Joint pain" },
];

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
  overrides,
  categories,
  onAdd,
}: {
  itemType: ItemType;
  placeholder: string;
  overrides: Record<string, OverrideEntry>;
  categories: readonly string[];
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

/** Add/remove which categories a type offers — food is never passed here
 * (its categories are fixed, see effectiveCategoryList's doc comment). */
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
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <ItemActions item={item} busy={busy} onArchiveToggle={onArchiveToggle} onRename={onRename} />
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
    </li>
  );
}

function ItemSection({
  itemType,
  label,
  placeholder,
  items,
  overrides,
  categories,
  canEditCategories,
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
  overrides: Record<string, OverrideEntry>;
  categories: readonly string[];
  canEditCategories: boolean;
  searchQuery: string;
  open: boolean;
  onToggleOpen: () => void;
  busyIdentity: string | null;
  onToggleArchive: (item: ManageableItem) => void;
  onRename: (item: ManageableItem, name: string) => void;
  onChangeCategory: (item: ManageableItem, category: string) => void;
  onAdd: (name: string, category: string) => Promise<void>;
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
          {canEditCategories && <CategoryManager categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />}

          <div className="mb-4">
            <AddItemForm itemType={itemType} placeholder={placeholder} overrides={overrides} categories={categories} onAdd={onAdd} />
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
                  categories={canEditCategories ? categories : null}
                  busy={busyIdentity === item.itemIdentity}
                  onArchiveToggle={() => onToggleArchive(item)}
                  onRename={(name) => onRename(item, name)}
                  onChangeCategory={canEditCategories ? (category) => onChangeCategory(item, category) : undefined}
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
                      categories={canEditCategories ? categories : null}
                      busy={busyIdentity === item.itemIdentity}
                      onArchiveToggle={() => onToggleArchive(item)}
                      onRename={(name) => onRename(item, name)}
                      onChangeCategory={canEditCategories ? (category) => onChangeCategory(item, category) : undefined}
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

export default function ManagePage() {
  const { status, isDemoData, refresh: refreshShared } = useData();
  const [rawItems, setRawItems] = useState<RawItem[] | null>(null);
  const [overrides, setOverrides] = useState<Record<string, OverrideEntry>>({});
  const [userCategoryRows, setUserCategoryRows] = useState<RawUserCategory[]>([]);
  const [openSections, setOpenSections] = useState<Set<ItemType>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  // Demo-mode state — purely in-memory, exactly like buildDemoDataset()
  // itself (see its own doc comment): never written to IndexedDB or
  // Supabase, so it's structurally impossible for it to still be there
  // once someone actually signs in. Seeded once (lazy initializer) from
  // the same deterministic demo dataset every other page shows, so
  // there's something real-looking to add/rename/archive/recategorize
  // interactively without an account.
  const [demoItems, setDemoItems] = useState<RawItem[]>(() => buildDemoDataset().items);
  const [demoOverrides, setDemoOverrides] = useState<Record<string, OverrideEntry>>({});
  const [demoUserCategoryRows, setDemoUserCategoryRows] = useState<RawUserCategory[]>([]);
  const [demoBusyIdentity, setDemoBusyIdentity] = useState<string | null>(null);

  // Status-neutral: reads whatever's currently in IndexedDB without
  // touching the shared data status, so the effect below can call this on
  // every status change without looping (see next comment).
  const loadLocalSnapshot = useCallback(async () => {
    const [items, userOverrides, categories] = await Promise.all([getAllItems(), getAllUserOverrides(), getAllUserCategories()]);
    setRawItems(items.filter((i) => !i.isRemoved));
    setOverrides(userOverrides);
    setUserCategoryRows(categories);
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
    const sourceOverrides = isDemoData ? demoOverrides : overrides;
    if (!source) return map;
    for (const it of source) {
      const c = classifyItem(it.rawName, sourceOverrides);
      map[c.itemType].push({
        itemIdentity: it.identity,
        item: c.canonicalName,
        category: c.category,
        subcategory: c.subcategory,
        isArchived: it.isArchived,
      });
    }
    return map;
  }, [isDemoData, demoItems, demoOverrides, rawItems, overrides]);

  const customCategoryNamesByType = useMemo(() => {
    const map: Record<ItemType, string[]> = { food: [], supplement: [], outcome: [], habit: [] };
    for (const row of isDemoData ? demoUserCategoryRows : userCategoryRows) map[row.itemType].push(row.name);
    return map;
  }, [isDemoData, demoUserCategoryRows, userCategoryRows]);

  const categoriesByType = useMemo(() => {
    const map = {} as Record<ItemType, readonly string[]>;
    for (const section of TYPE_SECTIONS) {
      map[section.type] = effectiveCategoryList(section.type, customCategoryNamesByType[section.type]);
    }
    return map;
  }, [customCategoryNamesByType]);

  function toggleSection(type: ItemType) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  async function handleAdd(itemType: ItemType, name: string, categoryOverride: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = normalizeName(trimmed);
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
      identity: generateManualItemId(key),
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

  async function handleAddCategory(itemType: ItemType, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = customCategoryNamesByType[itemType];
    const next = nextCategoryNames(itemType, current, { kind: "add", name: trimmed });
    if (next === current) return;
    // First customization for this type: materialize the built-in defaults
    // as real rows too, since from here on this type's category list comes
    // entirely from stored rows (see effectiveCategoryList).
    const namesToWrite = current.length > 0 ? [trimmed] : next;
    for (const categoryName of namesToWrite) {
      const entry: RawUserCategory = { itemType, name: categoryName };
      await putUserCategory(entry);
      void pushUserCategory(entry);
    }
    await refresh();
  }

  async function handleRemoveCategory(itemType: ItemType, name: string) {
    const current = customCategoryNamesByType[itemType];
    if (current.length === 0) {
      for (const categoryName of nextCategoryNames(itemType, current, { kind: "remove", name })) {
        const entry: RawUserCategory = { itemType, name: categoryName };
        await putUserCategory(entry);
        void pushUserCategory(entry);
      }
    } else {
      await deleteUserCategory(itemType, name);
    }
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

  function demoRename(item: ManageableItem, itemType: ItemType, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === item.item) return;
    setDemoBusyIdentity(item.itemIdentity);
    setDemoItems((prev) => prev.map((it) => (it.identity === item.itemIdentity ? { ...it, rawName: trimmed } : it)));
    const key = normalizeName(trimmed);
    setDemoOverrides((prev) => ({
      ...prev,
      [key]: { canonicalName: trimmed, itemType, category: item.category, subcategory: item.subcategory },
    }));
    setDemoBusyIdentity(null);
  }

  function demoChangeCategory(item: ManageableItem, itemType: ItemType, newCategory: string) {
    if (!newCategory || newCategory === item.category) return;
    setDemoBusyIdentity(item.itemIdentity);
    const existing = demoItems.find((it) => it.identity === item.itemIdentity);
    const key = normalizeName(existing?.rawName ?? item.item);
    setDemoOverrides((prev) => ({
      ...prev,
      [key]: { canonicalName: item.item, itemType, category: newCategory, subcategory: newCategory },
    }));
    setDemoBusyIdentity(null);
  }

  function demoHandleAdd(itemType: ItemType, name: string, categoryOverride: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve();
    const key = normalizeName(trimmed);
    const bundled = classifyItem(trimmed, demoOverrides);
    const needsOverride = bundled.matchedBy === "fallback";
    const guessedCategory = itemType === "food" ? lookupFoodCategory(trimmed) : null;
    const category = needsOverride ? (guessedCategory ?? (categoryOverride || CATEGORIES_BY_TYPE[itemType][0])) : bundled.category;
    if (needsOverride) {
      setDemoOverrides((prev) => ({ ...prev, [key]: { canonicalName: trimmed, itemType, category, subcategory: category } }));
    }
    setDemoItems((prev) => [
      ...prev,
      {
        identity: generateManualItemId(key),
        rawName: trimmed,
        unit: null,
        kind: null,
        frequency: null,
        isRemoved: false,
        isArchived: false,
        createdDate: todayLocalISODate(),
      },
    ]);
    return Promise.resolve();
  }

  function demoAddCategory(itemType: ItemType, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return Promise.resolve();
    setDemoUserCategoryRows((prev) => {
      const current = customCategoryNamesByType[itemType];
      const next = nextCategoryNames(itemType, current, { kind: "add", name: trimmed });
      if (next === current) return prev;
      const others = prev.filter((r) => r.itemType !== itemType);
      return [...others, ...next.map((n) => ({ itemType, name: n }))];
    });
    return Promise.resolve();
  }

  function demoRemoveCategory(itemType: ItemType, name: string): Promise<void> {
    setDemoUserCategoryRows((prev) => {
      const current = customCategoryNamesByType[itemType];
      const next = nextCategoryNames(itemType, current, { kind: "remove", name });
      const others = prev.filter((r) => r.itemType !== itemType);
      return [...others, ...next.map((n) => ({ itemType, name: n }))];
    });
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
          Add, rename, archive, or unarchive anything you track, and manage the category list for Supplements,
          Habits, and Symptoms. Everything here is synced straight to your account — the same tables every page
          reads from, so there&apos;s nowhere else to edit this by hand. Archiving hides an item from the Log
          page and this list&apos;s active section; its full logged history stays in every dashboard. Food&apos;s
          categories are fixed — they drive the nutrition-guidance engine on the Food page.
        </p>
        {isDemoData && (
          <p className="mt-2 text-sm" style={{ color: "var(--status-warning)" }}>
            Example data — try adding, renaming, archiving, and managing categories freely below. None of this is
            saved anywhere; sign in to manage your real items instead.
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
          overrides={isDemoData ? demoOverrides : overrides}
          categories={categoriesByType[section.type]}
          canEditCategories={section.type !== "food"}
          searchQuery={searchQuery}
          open={openSections.has(section.type)}
          onToggleOpen={() => toggleSection(section.type)}
          busyIdentity={busyIdentity}
          onToggleArchive={(item) => (isDemoData ? demoToggleArchive(item) : void realToggleArchive(item))}
          onRename={(item, name) => (isDemoData ? demoRename(item, section.type, name) : void realRename(item, section.type, name))}
          onChangeCategory={(item, category) =>
            isDemoData ? demoChangeCategory(item, section.type, category) : void realChangeCategory(item, section.type, category)
          }
          onAdd={(name, category) => (isDemoData ? demoHandleAdd(section.type, name, category) : handleAdd(section.type, name, category))}
          onAddCategory={(name) => (isDemoData ? demoAddCategory(section.type, name) : handleAddCategory(section.type, name))}
          onRemoveCategory={(name) => (isDemoData ? demoRemoveCategory(section.type, name) : handleRemoveCategory(section.type, name))}
        />
      ))}
    </div>
  );
}
