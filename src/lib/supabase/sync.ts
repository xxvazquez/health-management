import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import {
  putItem,
  putLog,
  putDiaryEntry,
  putCategory,
  putStoolLog,
  putGymLog,
  deleteGymLogById,
  clearAllData,
} from "@/lib/db/indexedDb";
import type { RawDiaryEntry, RawLog, RawItem, RawGymLog, RawCategory, RawStoolLog, StoolColor, PaperCleanliness } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";

/** App-internal `ItemType` -> the table-name/db `item_type` value. Only
 * "outcome" differs (tables/rows say "symptom", matching the Log page's
 * own label) — everything else is spelled the same both places. */
const DB_TYPE: Record<ItemType, string> = { food: "food", supplement: "supplement", outcome: "symptom", habit: "habit" };
const ITEM_TABLE: Record<ItemType, string> = {
  food: "food_items",
  supplement: "supplement_items",
  outcome: "symptom_items",
  habit: "habit_items",
};
const LOG_TABLE: Record<ItemType, string> = {
  food: "food_logs",
  supplement: "supplement_logs",
  outcome: "symptom_logs",
  habit: "habit_logs",
};
const DIARY_TABLE: Record<ItemType, string> = {
  food: "food_diary",
  supplement: "supplement_diary",
  outcome: "symptom_diary",
  habit: "habit_diary",
};

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

/** Upserts one item's own metadata (name, category, archive state) to
 * Supabase — shared by every write that touches an item's row, and by
 * rename/archive/change-category from Manage. No-op if Supabase isn't
 * configured or nobody's signed in. */
export async function pushItem(item: RawItem): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  await supabase.from(ITEM_TABLE[item.itemType]).upsert({
    id: item.identity,
    user_id: userId,
    name: item.rawName,
    category_id: item.categoryId,
    item_type: DB_TYPE[item.itemType],
    is_archived: item.isArchived,
    created_date: item.createdDate,
  });
}

/** Upserts one log row to Supabase — a single-row upsert, not a
 * delete-and-replace: every log has its own stable id both locally and
 * remotely, so pushing one tap never touches any other row. No-op if
 * Supabase isn't configured or nobody's signed in. */
export async function pushLog(log: RawLog): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  const row: Record<string, unknown> = {
    id: log.identity,
    user_id: userId,
    item_id: log.itemIdentity,
    date: log.date,
    value: log.value,
    updated_at: log.updatedAt,
  };
  if (log.itemType === "food") row.meal_tag = log.mealTag;
  await supabase.from(LOG_TABLE[log.itemType]).upsert(row);
}

/** Deletes one log row, locally already gone by the time this is called —
 * just needs to know which table it lived in. */
export async function deleteLog(identity: string, itemType: ItemType): Promise<void> {
  if (!supabase) return;
  await supabase.from(LOG_TABLE[itemType]).delete().eq("id", identity);
}

/** Upserts one item+day note. No-op if Supabase isn't configured or nobody's signed in. */
export async function pushDiaryEntry(entry: RawDiaryEntry): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  await supabase.from(DIARY_TABLE[entry.itemType]).upsert({
    id: entry.identity,
    user_id: userId,
    item_id: entry.itemIdentity,
    date: entry.date,
    content: entry.content,
    title: entry.title,
    updated_at: entry.updatedAt,
  });
}

/** Upserts one user-defined category (supplement/habit/outcome only — food's
 * list is fixed in code). No-op if Supabase isn't configured or nobody's signed in. */
export async function pushCategory(entry: RawCategory): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  await supabase.from("categories").upsert({
    id: entry.id,
    user_id: userId,
    item_type: DB_TYPE[entry.itemType],
    name: entry.name,
  });
}

/** Deletes one category. The DB rejects this with a foreign-key error if
 * any item still references it (`on delete restrict`) — callers should
 * reassign or archive those items first rather than catching that error. */
export async function deleteCategory(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("categories").delete().eq("id", id);
}

/** Upserts one bowel-movement entry. No-op if Supabase isn't configured or nobody's signed in. */
export async function pushStoolLog(log: RawStoolLog): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  await supabase.from("stool_logs").upsert({
    id: log.id,
    user_id: userId,
    date: log.date,
    logged_at: log.loggedAt,
    bristol_score: log.bristolScore,
    no_bristol: log.noBristol,
    color: log.color,
    is_sticky: log.isSticky,
    is_smelly: log.isSmelly,
    is_straining: log.isStraining,
    has_mucus: log.hasMucus,
    has_urgency: log.hasUrgency,
    has_visible_food_particles: log.hasVisibleFoodParticles,
    has_incomplete_evacuation: log.hasIncompleteEvacuation,
    paper_cleanliness: log.paperCleanliness,
    time_on_toilet_minutes: log.timeOnToiletMinutes,
    note: log.note,
    updated_at: log.updatedAt,
  });
}

export async function deleteStoolLog(id: string): Promise<void> {
  if (!supabase) return;
  await supabase.from("stool_logs").delete().eq("id", id);
}

/** Upserts one gym log. Unchanged by the data-model redesign — `gym_logs`
 * never had an "item" dimension to split up. */
export async function pushGymLog(log: RawGymLog): Promise<void> {
  const userId = await currentUserId();
  if (!supabase || !userId) return;

  await supabase.from("gym_logs").upsert({
    id: log.id,
    user_id: userId,
    date: log.date,
    exercise: log.exercise,
    weight_kg: log.weightKg,
    updated_at: new Date(log.updatedAt).toISOString(),
  });
}

export async function deleteGymLog(id: string): Promise<void> {
  await deleteGymLogById(id);
  if (!supabase) return;
  await supabase.from("gym_logs").delete().eq("id", id);
}

interface ItemRow {
  id: string;
  name: string;
  category_id: string | null;
  is_archived: boolean | null;
  created_date: string | null;
}

interface LogRow {
  id: string;
  item_id: string;
  date: string;
  value: number | null;
  meal_tag?: string | null;
  updated_at: string | null;
}

interface DiaryRow {
  id: string;
  item_id: string;
  date: string;
  content: string | null;
  title: string | null;
  updated_at: string | null;
}

interface CategoryRow {
  id: string;
  item_type: string;
  name: string;
}

interface StoolLogRow {
  id: string;
  date: string;
  logged_at: string;
  bristol_score: number | null;
  no_bristol: boolean;
  color: string | null;
  is_sticky: boolean;
  is_smelly: boolean;
  is_straining: boolean;
  has_mucus: boolean;
  has_urgency: boolean;
  has_visible_food_particles: boolean;
  has_incomplete_evacuation: boolean;
  paper_cleanliness: string | null;
  time_on_toilet_minutes: number | null;
  note: string | null;
  updated_at: string | null;
}

interface GymLogRow {
  id: string;
  date: string;
  exercise: RawGymLog["exercise"];
  weight_kg: number;
  updated_at: string;
}

const PAGE_SIZE = 1000;

/** Reads an entire table for the signed-in user, paginated — a plain
 * `.select("*")` silently truncates at Postgrest's default max-rows (1000
 * on most projects); paging with `.range()` until a page comes back short
 * is what actually gets everything. */
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

const ITEM_TYPES: ItemType[] = ["food", "supplement", "outcome", "habit"];

/**
 * Pulls every cloud row belonging to the signed-in user into IndexedDB — a
 * full mirror, not a merge. The local cache is wiped first: Supabase is the
 * only source of truth, so anything in IndexedDB that ISN'T also in
 * Supabase must not survive a pull.
 */
export async function pullFromCloud(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const categoryRows = await fetchAllRows<CategoryRow>(supabase, "categories");
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));

  const [itemsByType, logsByType, diaryByType] = await Promise.all([
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<ItemRow>(supabase!, ITEM_TABLE[t]))),
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<LogRow>(supabase!, LOG_TABLE[t]))),
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<DiaryRow>(supabase!, DIARY_TABLE[t]))),
  ]);
  const [stoolLogRows, gymLogRows] = await Promise.all([
    fetchAllRows<StoolLogRow>(supabase, "stool_logs"),
    fetchAllRows<GymLogRow>(supabase, "gym_logs"),
  ]);

  await clearAllData();

  for (const entry of categoryRows) {
    await putCategory({ id: entry.id, itemType: dbTypeToItemType(entry.item_type), name: entry.name });
  }

  ITEM_TYPES.forEach((itemType, i) => {
    for (const row of itemsByType[i]) {
      const item: RawItem = {
        identity: row.id,
        itemType,
        rawName: row.name,
        category: categoryNameById.get(row.category_id ?? "") ?? "Other",
        categoryId: row.category_id,
        isArchived: row.is_archived ?? false,
        createdDate: row.created_date,
      };
      void putItem(item);
    }
  });

  ITEM_TYPES.forEach((itemType, i) => {
    for (const row of logsByType[i]) {
      const log: RawLog = {
        identity: row.id,
        itemIdentity: row.item_id,
        itemType,
        date: row.date,
        value: row.value,
        updatedAt: row.updated_at,
        mealTag: itemType === "food" ? (row.meal_tag ?? null) : null,
      };
      void putLog(log);
    }
  });

  ITEM_TYPES.forEach((itemType, i) => {
    for (const row of diaryByType[i]) {
      const entry: RawDiaryEntry = {
        identity: row.id,
        itemIdentity: row.item_id,
        itemType,
        date: row.date,
        content: row.content,
        title: row.title,
        updatedAt: row.updated_at,
      };
      void putDiaryEntry(entry);
    }
  });

  for (const row of stoolLogRows) {
    const log: RawStoolLog = {
      id: row.id,
      date: row.date,
      loggedAt: row.logged_at,
      bristolScore: row.bristol_score,
      noBristol: row.no_bristol,
      color: (row.color as StoolColor | null) ?? null,
      isSticky: row.is_sticky,
      isSmelly: row.is_smelly,
      isStraining: row.is_straining,
      hasMucus: row.has_mucus,
      hasUrgency: row.has_urgency,
      hasVisibleFoodParticles: row.has_visible_food_particles,
      hasIncompleteEvacuation: row.has_incomplete_evacuation,
      paperCleanliness: (row.paper_cleanliness as PaperCleanliness | null) ?? null,
      timeOnToiletMinutes: row.time_on_toilet_minutes,
      note: row.note,
      updatedAt: row.updated_at,
    };
    await putStoolLog(log);
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

function dbTypeToItemType(dbType: string): ItemType {
  return dbType === "symptom" ? "outcome" : (dbType as ItemType);
}
