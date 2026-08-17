import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import {
  getLogsForItemOnDate,
  getItem,
  putDiaryEntry,
  putLog,
  putItem,
  putGymLog,
  deleteGymLogById,
  setUserOverride,
  clearAllData,
} from "@/lib/db/indexedDb";
import type { OverrideEntry } from "@/taxonomy/classify";
import type { RawDiaryEntry, RawLog, RawItem, RawGymLog } from "@/lib/types";

/**
 * Upserts one item's own metadata (name, archive state, etc.) to Supabase —
 * shared by `syncItemDay` (after a log write) and any action that only
 * changes the item itself, like renaming or archiving/unarchiving from the
 * Habits/Supplements page. No-op if Supabase isn't configured or nobody's
 * signed in.
 */
export async function pushItem(item: RawItem): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from("items").upsert({
    identity: item.identity,
    user_id: session.user.id,
    raw_name: item.rawName,
    unit: item.unit,
    kind: item.kind,
    frequency: item.frequency,
    is_removed: item.isRemoved,
    is_archived: item.isArchived,
    created_date: item.createdDate,
  });
}

/**
 * Pushes everything logged for one item on one day (from the Log page) to
 * Supabase: upserts the item's own metadata, then replaces that
 * item+date's remote rows with whatever's now stored locally. Silently
 * skips historical-origin logs — this only syncs what was actually typed
 * or tapped through the Log page, not the bulk historical migration
 * (that goes through the CSV import instead).
 *
 * No-op if Supabase isn't configured or nobody's signed in, so local
 * logging always works regardless of cloud state.
 */
export async function syncItemDay(itemIdentity: string, date: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  const item = await getItem(itemIdentity);
  if (item) await pushItem(item);

  const manualLogs = (await getLogsForItemOnDate(itemIdentity, date)).filter((l) => l.identity.startsWith("manual:"));

  await supabase.from("logs").delete().eq("item_identity", itemIdentity).eq("date", date);
  if (manualLogs.length > 0) {
    await supabase.from("logs").insert(
      manualLogs.map((l) => ({
        identity: l.identity,
        user_id: userId,
        item_identity: l.itemIdentity,
        date: l.date,
        value: l.value,
        goal_value: l.goalValue,
        is_skipped: l.isSkipped,
        updated_at: l.updatedAt,
        meal_tag: l.mealTag,
      })),
    );
  }
}

/**
 * Upserts one gym log to Supabase, keyed by its own id — unlike
 * syncItemDay's item+date replace strategy, since a gym log has no
 * separate "item" dimension to key off (the exercise is the value, not an
 * identity). No-op if Supabase isn't configured or nobody's signed in.
 */
export async function pushGymLog(log: RawGymLog): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from("gym_logs").upsert({
    id: log.id,
    user_id: session.user.id,
    date: log.date,
    exercise: log.exercise,
    weight_kg: log.weightKg,
    updated_at: new Date(log.updatedAt).toISOString(),
  });
}

/** Deletes one gym log locally and (if signed in) from Supabase. */
export async function deleteGymLog(id: string): Promise<void> {
  await deleteGymLogById(id);
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  await supabase.from("gym_logs").delete().eq("id", id);
}

export async function pushUserOverride(key: string, entry: OverrideEntry): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from("user_overrides").upsert({
    key,
    user_id: session.user.id,
    canonical_name: entry.canonicalName,
    item_type: entry.itemType,
    category: entry.category,
    subcategory: entry.subcategory,
  });
}

/** Upserts one item+day note. No-op if Supabase isn't configured or nobody's signed in. */
export async function pushDiaryEntry(entry: RawDiaryEntry): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  await supabase.from("diary").upsert({
    identity: entry.identity,
    user_id: session.user.id,
    item_identity: entry.itemIdentity,
    date: entry.date,
    content: entry.content,
    title: entry.title,
    updated_at: entry.updatedAt,
  });
}

interface ItemRow {
  identity: string;
  raw_name: string;
  unit: string | null;
  kind: string | null;
  frequency: string | null;
  is_removed: boolean;
  is_archived: boolean | null;
  created_date: string | null;
}

interface LogRow {
  identity: string;
  item_identity: string;
  date: string;
  value: number | null;
  goal_value: number | null;
  is_skipped: boolean;
  updated_at: number | null;
  meal_tag: string | null;
}

interface OverrideRow {
  key: string;
  canonical_name: string;
  item_type: OverrideEntry["itemType"];
  category: string;
  subcategory: string;
}

interface DiaryRow {
  identity: string;
  item_identity: string;
  date: string;
  content: string | null;
  title: string | null;
  updated_at: number | null;
}

interface GymLogRow {
  id: string;
  date: string;
  exercise: RawGymLog["exercise"];
  weight_kg: number;
  updated_at: string;
}

const PAGE_SIZE = 1000;

/**
 * Reads an entire table for the signed-in user, paginated. A plain
 * `.select("*")` silently truncates at Postgrest's default max-rows (1000
 * on most projects) — for a table with more history than that, the rest
 * would just go missing with no error. Paging with `.range()` until a page
 * comes back short is what actually gets everything.
 */
async function fetchAllRows<T>(client: SupabaseClient, table: string): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

/**
 * Pulls every cloud row belonging to the signed-in user into IndexedDB —
 * a full mirror, not a merge. The local cache is wiped first: Supabase is
 * the only source of truth, so anything in IndexedDB that ISN'T also in
 * Supabase (leftover local-only taps from before signing in, rows deleted
 * on another device, stray test data) must not survive a pull. Upserting
 * on top of whatever was already there would let exactly that kind of
 * stale data linger and display as if it were real synced data.
 */
export async function pullFromCloud(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const [itemRows, logRows, overrideRows, diaryRows, gymLogRows] = await Promise.all([
    fetchAllRows<ItemRow>(supabase, "items"),
    fetchAllRows<LogRow>(supabase, "logs"),
    fetchAllRows<OverrideRow>(supabase, "user_overrides"),
    fetchAllRows<DiaryRow>(supabase, "diary"),
    fetchAllRows<GymLogRow>(supabase, "gym_logs"),
  ]);

  await clearAllData();

  for (const row of itemRows) {
    const item: RawItem = {
      identity: row.identity,
      rawName: row.raw_name,
      unit: row.unit,
      kind: row.kind,
      frequency: row.frequency,
      isRemoved: row.is_removed,
      // Defensive fallback: false until the `is_archived` migration has
      // been run against this Supabase project (see supabase/schema.sql).
      isArchived: row.is_archived ?? false,
      createdDate: row.created_date,
    };
    await putItem(item);
  }

  for (const row of logRows) {
    const log: RawLog = {
      identity: row.identity,
      itemIdentity: row.item_identity,
      date: row.date,
      value: row.value,
      goalValue: row.goal_value,
      isSkipped: row.is_skipped,
      updatedAt: row.updated_at,
      mealTag: row.meal_tag,
    };
    await putLog(log);
  }

  for (const row of overrideRows) {
    await setUserOverride(row.key, {
      canonicalName: row.canonical_name,
      itemType: row.item_type,
      category: row.category,
      subcategory: row.subcategory,
    });
  }

  for (const row of diaryRows) {
    const entry: RawDiaryEntry = {
      identity: row.identity,
      itemIdentity: row.item_identity,
      date: row.date,
      content: row.content,
      title: row.title,
      updatedAt: row.updated_at,
    };
    await putDiaryEntry(entry);
  }

  for (const row of gymLogRows) {
    const log: RawGymLog = {
      id: row.id,
      date: row.date,
      exercise: row.exercise,
      weightKg: row.weight_kg,
      updatedAt: new Date(row.updated_at).getTime(),
    };
    await putGymLog(log);
  }
}
