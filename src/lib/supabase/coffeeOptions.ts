import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";

export type CoffeeOptionKind = "brewing_type" | "brewing_method" | "characteristic";

/** One editable chip in a Coffee picker — brewing type, brewing method, or
 * a tasting characteristic. Same shape/behaviour as stool_options: the
 * built-in list shows until the first edit materializes real rows. */
export interface CoffeeOption {
  id: string;
  kind: CoffeeOptionKind;
  label: string;
  sortOrder: number;
  isArchived: boolean;
}

interface CoffeeOptionRow {
  id: string;
  kind: CoffeeOptionKind;
  label: string;
  sort_order: number;
  is_archived: boolean;
}

const COLUMNS = "id, kind, label, sort_order, is_archived";

const DEFAULT_BREWING_TYPES = ["Filter", "Espresso", "Cold brew", "Batch brew"];
const DEFAULT_BREWING_METHODS = ["V60", "AeroPress", "Moka pot", "Machine", "French press"];
const DEFAULT_CHARACTERISTICS = [
  "Bright",
  "Floral",
  "Balanced",
  "Full body",
  "Fruity",
  "Nutty",
  "Chocolatey",
  "Bitter",
  "Sour",
  "Under-extracted",
  "Over-extracted",
];

/** The built-in list for a kind — shown to anyone who hasn't customised it
 * yet, and the set the first edit materializes. */
export function defaultCoffeeOptions(kind: CoffeeOptionKind): string[] {
  if (kind === "brewing_type") return DEFAULT_BREWING_TYPES;
  if (kind === "brewing_method") return DEFAULT_BREWING_METHODS;
  return DEFAULT_CHARACTERISTICS;
}

function toOption(row: CoffeeOptionRow): CoffeeOption {
  return { id: row.id, kind: row.kind, label: row.label, sortOrder: row.sort_order, isArchived: row.is_archived };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchCoffeeOptions(): Promise<CoffeeOption[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("coffee_options")
    .select(COLUMNS)
    .eq("user_id", myUserId)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as CoffeeOptionRow[]).map(toOption);
}

/** Every column, so an offline create and a later edit of the same
 * still-unsynced row merge into one complete row. */
function payload(o: CoffeeOption, userId: string): Record<string, unknown> {
  return {
    id: o.id,
    user_id: userId,
    kind: o.kind,
    label: o.label.trim(),
    sort_order: o.sortOrder,
    is_archived: o.isArchived,
    updated_at: new Date().toISOString(),
  };
}

export async function createCoffeeOption(kind: CoffeeOptionKind, label: string, sortOrder: number): Promise<CoffeeOption> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const o: CoffeeOption = { id: createTimeOrderedId(), kind, label: label.trim(), sortOrder, isArchived: false };
  await upsertDirect(myUserId, "coffee_options", o.id, payload(o, myUserId));
  return o;
}

export interface CoffeeOptionPatch {
  label?: string;
  isArchived?: boolean;
  sortOrder?: number;
}

export async function updateCoffeeOption(option: CoffeeOption, patch: CoffeeOptionPatch): Promise<CoffeeOption> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: CoffeeOption = {
    ...option,
    label: patch.label !== undefined ? patch.label.trim() : option.label,
    isArchived: patch.isArchived !== undefined ? patch.isArchived : option.isArchived,
    sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : option.sortOrder,
  };
  await upsertDirect(myUserId, "coffee_options", next.id, payload(next, myUserId));
  return next;
}

export async function deleteCoffeeOption(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "coffee_options", id);
}

/** Materializes a real row for every default of `kind` that doesn't exist
 * yet. Returns the fresh full list (all kinds). */
export async function ensureCoffeeOptions(kind: CoffeeOptionKind): Promise<CoffeeOption[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const existing = await fetchCoffeeOptions();
  const have = new Set(existing.filter((o) => o.kind === kind).map((o) => o.label.toLowerCase()));
  const missing = defaultCoffeeOptions(kind).filter((label) => !have.has(label.toLowerCase()));
  if (missing.length === 0) return existing;
  const { error } = await supabase.from("coffee_options").insert(
    missing.map((label, i) => ({
      user_id: myUserId,
      kind,
      label,
      sort_order: i,
    })),
  );
  if (error) throw error;
  return fetchCoffeeOptions();
}
