import { supabase } from "./client";
import { createTimeOrderedId } from "@/lib/sortableId";
import { deleteDirect, upsertDirect } from "./directWrite";
import {
  DEFAULT_STOOL_CHARACTERISTICS,
  DEFAULT_STOOL_COLORS,
  DEFAULT_STOOL_FLOATATIONS,
  DEFAULT_STOOL_SYMPTOMS,
  STOOL_COLOR_SWATCH,
  type StoolOptionKind,
} from "@/lib/types";

/** One editable chip in a Stool picker. `swatch` is the hex dot for the
 * `color` kind (null otherwise). */
export interface StoolOption {
  id: string;
  kind: StoolOptionKind;
  label: string;
  swatch: string | null;
  sortOrder: number;
  isArchived: boolean;
}

interface StoolOptionRow {
  id: string;
  kind: StoolOptionKind;
  label: string;
  swatch: string | null;
  sort_order: number;
  is_archived: boolean;
}

const COLUMNS = "id, kind, label, swatch, sort_order, is_archived";

/** The built-in list for a kind — shown to anyone who hasn't customised it
 * yet, and the set the first edit materializes. */
export function defaultStoolOptions(kind: StoolOptionKind): string[] {
  if (kind === "color") return DEFAULT_STOOL_COLORS;
  if (kind === "symptom") return DEFAULT_STOOL_SYMPTOMS;
  if (kind === "floatation") return DEFAULT_STOOL_FLOATATIONS;
  return DEFAULT_STOOL_CHARACTERISTICS;
}

function toOption(row: StoolOptionRow): StoolOption {
  return { id: row.id, kind: row.kind, label: row.label, swatch: row.swatch, sortOrder: row.sort_order, isArchived: row.is_archived };
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

export async function fetchStoolOptions(): Promise<StoolOption[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const { data, error } = await supabase
    .from("stool_options")
    .select(COLUMNS)
    .eq("user_id", myUserId)
    .order("kind", { ascending: true })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data as StoolOptionRow[]).map(toOption);
}

/** Every column, so an offline create and a later edit of the same
 * still-unsynced row merge into one complete row. */
function payload(o: StoolOption, userId: string): Record<string, unknown> {
  return {
    id: o.id,
    user_id: userId,
    kind: o.kind,
    label: o.label.trim(),
    swatch: o.swatch,
    sort_order: o.sortOrder,
    is_archived: o.isArchived,
    updated_at: new Date().toISOString(),
  };
}

export async function createStoolOption(kind: StoolOptionKind, label: string, sortOrder: number): Promise<StoolOption> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const o: StoolOption = { id: createTimeOrderedId(), kind, label: label.trim(), swatch: null, sortOrder, isArchived: false };
  await upsertDirect(myUserId, "stool_options", o.id, payload(o, myUserId));
  return o;
}

export interface StoolOptionPatch {
  label?: string;
  swatch?: string | null;
  isArchived?: boolean;
  sortOrder?: number;
}

export async function updateStoolOption(option: StoolOption, patch: StoolOptionPatch): Promise<StoolOption> {
  const myUserId = await currentUserId();
  if (!myUserId) throw new Error("Sign in first.");
  const next: StoolOption = {
    ...option,
    label: patch.label !== undefined ? patch.label.trim() : option.label,
    swatch: patch.swatch !== undefined ? patch.swatch : option.swatch,
    isArchived: patch.isArchived !== undefined ? patch.isArchived : option.isArchived,
    sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : option.sortOrder,
  };
  await upsertDirect(myUserId, "stool_options", next.id, payload(next, myUserId));
  return next;
}

export async function deleteStoolOption(id: string): Promise<void> {
  const myUserId = await currentUserId();
  if (!myUserId) return;
  await deleteDirect(myUserId, "stool_options", id);
}

/** Materializes a real row for every default of `kind` that doesn't exist
 * yet — the counterpart of `ensureDoctorSpecialties`. Returns the fresh
 * full list (all kinds). */
export async function ensureStoolOptions(kind: StoolOptionKind): Promise<StoolOption[]> {
  if (!supabase) return [];
  const myUserId = await currentUserId();
  if (!myUserId) return [];
  const existing = await fetchStoolOptions();
  const have = new Set(existing.filter((o) => o.kind === kind).map((o) => o.label.toLowerCase()));
  const missing = defaultStoolOptions(kind).filter((label) => !have.has(label.toLowerCase()));
  if (missing.length === 0) return existing;
  const { error } = await supabase.from("stool_options").insert(
    missing.map((label, i) => ({
      user_id: myUserId,
      kind,
      label,
      swatch: kind === "color" ? (STOOL_COLOR_SWATCH[label] ?? null) : null,
      sort_order: i,
    })),
  );
  if (error) throw error;
  return fetchStoolOptions();
}
