import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import {
  putItemInternal,
  deleteItemLocalInternal,
  putLogInternal,
  deleteLogByIdInternal,
  updateLogMealTagInternal,
  updateLogTimeInternal,
  toggleDailyLogInternal,
  incrementDailyLogInternal,
  setDailyDurationInternal,
  decrementDailyLogInternal,
  decrementDailyLogForMealInternal,
  putDiaryEntryInternal,
  setDiaryNoteInternal,
  putCategoryInternal,
  deleteCategoryLocalInternal,
  putStoolLogInternal,
  deleteStoolLogByIdInternal,
  updateStoolLogTimeInternal,
  putGymLogInternal,
  deleteGymLogByIdInternal,
  clearAllDataInternal,
  enqueueOutboxInternal,
  withDataLock,
  getAllItems,
  type NewOutboxEntry,
  type OutboxOperation,
} from "@/lib/db/indexedDb";
import { drainOutbox } from "./outbox";
import type { RawDiaryEntry, RawLog, RawItem, RawGymLog, RawCategory, RawStoolLog, StoolColor, StoolFloatation, PaperCleanliness, WorkoutUnit } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";
import { normalizeName } from "@/taxonomy/normalizeName";

/** App-internal `ItemType` -> the table-name/db `item_type` value. Only
 * "outcome" differs (tables/rows say "symptom", matching the Log page's
 * own label) — everything else is spelled the same both places. */
const DB_TYPE: Record<ItemType, string> = { food: "food", supplement: "supplement", outcome: "symptom", habit: "habit", workout: "workout" };
const ITEM_TABLE: Record<ItemType, string> = {
  food: "food_items",
  supplement: "supplement_items",
  outcome: "symptom_items",
  habit: "habit_items",
  workout: "workout_items",
};
// Workout logging stays on its own workout_logs/RawGymLog path (weight per set,
// several entries a day) rather than the generic increment/toggle/duration
// *AndSync functions below — "workout" is only ever looked up here to keep
// this dict exhaustive over ItemType; nothing actually calls a generic log
// function with itemType "workout".
const LOG_TABLE: Record<ItemType, string> = {
  food: "food_logs",
  supplement: "supplement_logs",
  outcome: "symptom_logs",
  habit: "habit_logs",
  workout: "workout_logs",
};
const DIARY_TABLE: Record<ItemType, string> = {
  food: "food_diary",
  supplement: "supplement_diary",
  outcome: "symptom_diary",
  habit: "habit_diary",
  workout: "workout_diary",
};

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

// ---------------------------------------------------------------------------
// Supabase row shaping — unchanged from the pre-outbox pushX functions,
// just extracted so both the enqueue side (below) and any other caller can
// build the exact same payload shape.
// ---------------------------------------------------------------------------

// Only supplement_items and habit_items actually have a reminder_time
// column (see schema.sql) — food_items/symptom_items/workout_items don't,
// and sending the key for those would make Supabase reject the whole
// upsert (unknown column), not just ignore it. Deliberately never includes
// reminder_last_sent_date either way — that column is cron-only
// bookkeeping, and if a generic edit (rename/archive/category) echoed it
// back from a possibly-stale local cache, it could revert a fresher stamp
// the cron already wrote server-side. Only setItemReminderTimeAndSync
// below ever touches that column, and it does so deliberately, not by
// echoing a cached value. See its own doc comment.
const TYPES_WITH_REMINDERS = new Set<ItemType>(["supplement", "habit"]);

function buildItemRow(item: RawItem, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: item.identity,
    user_id: userId,
    name: item.rawName,
    category_id: item.categoryId,
    item_type: DB_TYPE[item.itemType],
    is_archived: item.isArchived,
    created_date: item.createdDate,
  };
  if (TYPES_WITH_REMINDERS.has(item.itemType)) row.reminder_time = item.reminderTime;
  if (item.itemType === "workout") row.unit = item.unit ?? "kg";
  return row;
}

function buildLogRow(log: RawLog, userId: string): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: log.identity,
    user_id: userId,
    item_id: log.itemIdentity,
    date: log.date,
    value: log.value,
    updated_at: log.updatedAt,
  };
  if (log.itemType === "food") row.meal_tag = log.mealTag;
  return row;
}

function buildDiaryRow(entry: RawDiaryEntry, userId: string): Record<string, unknown> {
  return {
    id: entry.identity,
    user_id: userId,
    item_id: entry.itemIdentity,
    date: entry.date,
    content: entry.content,
    title: entry.title,
    updated_at: entry.updatedAt,
  };
}

function buildCategoryRow(entry: RawCategory, userId: string): Record<string, unknown> {
  return { id: entry.id, user_id: userId, item_type: DB_TYPE[entry.itemType], name: entry.name };
}

function buildStoolLogRow(log: RawStoolLog, userId: string): Record<string, unknown> {
  return {
    id: log.id,
    user_id: userId,
    date: log.date,
    logged_at: log.loggedAt,
    bristol_scores: log.bristolScores,
    no_bristol: log.noBristol,
    color: log.color,
    floatation: log.floatation,
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
  };
}

/** workout_logs stores a real FK to workout_items (item_id), but the rest of the
 * app still treats a RawGymLog's `exercise` as a plain display name (see the
 * decision in workoutItemIdByName-style lookups elsewhere) — resolving name
 * -> id is confined to this push boundary so nothing else has to change. */
async function buildGymLogRow(log: RawGymLog, userId: string): Promise<Record<string, unknown>> {
  const items = await getAllItems();
  const match = items.find((item) => item.itemType === "workout" && normalizeName(item.rawName) === normalizeName(log.exercise));
  if (!match) throw new Error(`No workout item found for exercise "${log.exercise}" — add it in Manage before logging.`);
  return {
    id: log.id,
    user_id: userId,
    date: log.date,
    item_id: match.identity,
    weight_kg: log.weightKg,
    updated_at: new Date(log.updatedAt).toISOString(),
  };
}

function logEnqueue(log: RawLog, userId: string, op: OutboxOperation): NewOutboxEntry {
  const table = LOG_TABLE[log.itemType];
  return {
    userId,
    table,
    op,
    payload: op === "upsert" ? buildLogRow(log, userId) : { id: log.identity },
    dedupeKey: `${table}:${log.identity}`,
  };
}

// ---------------------------------------------------------------------------
// Mutation + outbox enqueue — each of these is ONE atomic operation under
// withDataLock: the local IndexedDB write and the outbox entry that
// represents it to Supabase either both happen, or (if the lock is
// currently held by a destructive cloud pull) both wait for that pull to
// finish first. This is what keeps "the record exists locally" and "the
// record is queued to sync" from ever being separated by a pull — see
// indexedDb.ts's withDataLock doc comment and pullFromCloud below.
//
// No-ops the enqueue (but still performs the local write) when signed out
// or Supabase isn't configured — same as the old pushX functions' guard.
// ---------------------------------------------------------------------------

export function putItemAndSync(item: RawItem): Promise<void> {
  return withDataLock(async () => {
    await putItemInternal(item);
    const userId = await currentUserId();
    if (!userId) return;
    const table = ITEM_TABLE[item.itemType];
    await enqueueOutboxInternal({ userId, table, op: "upsert", payload: buildItemRow(item, userId), dedupeKey: `${table}:${item.identity}` });
  });
}

/** Hard-deletes an item with no logged history — unlike archiving, this
 * actually removes the row. Only ever safe to call for an item identity
 * not in `getItemIdentitiesWithHistory()` (checked by the caller): every
 * `*_logs`/`*_diary` table's FK to its item table is `on delete restrict`,
 * so deleting an item with any history would be rejected by Supabase. */
export function deleteItemAndSync(identity: string, itemType: ItemType): Promise<void> {
  return withDataLock(async () => {
    await deleteItemLocalInternal(identity);
    const userId = await currentUserId();
    if (!userId) return;
    const table = ITEM_TABLE[itemType];
    await enqueueOutboxInternal({ userId, table, op: "delete", payload: { id: identity }, dedupeKey: `${table}:${identity}` });
  });
}

/** The one place reminder_time changes — also resets the server's
 * reminder_last_sent_date dedupe stamp, since a new (or cleared) schedule
 * invalidates whatever the cron already resolved under the old one. Uses
 * its own dedupeKey (`${table}:${id}:reminder`), distinct from the item's
 * own `${table}:${id}` — sharing the item's key would let a later unrelated
 * edit (rename, etc.) coalesce into and silently drop this reset before it
 * ever reached the server; see the doc comment on buildItemRow and the
 * plan this shipped with for the full reasoning. Ordering across the two
 * keys is still guaranteed by the outbox's global createdAt sort
 * (indexedDb.ts's getEligibleOutboxEntries), so nothing here can be
 * reverted out of order by that split. */
export function setItemReminderTimeAndSync(item: RawItem, time: string | null): Promise<void> {
  return withDataLock(async () => {
    const updated = { ...item, reminderTime: time };
    await putItemInternal(updated);
    const userId = await currentUserId();
    if (!userId) return;
    const table = ITEM_TABLE[item.itemType];
    const payload = { ...buildItemRow(updated, userId), reminder_last_sent_date: null };
    await enqueueOutboxInternal({ userId, table, op: "upsert", payload, dedupeKey: `${table}:${item.identity}:reminder` });
  });
}

export function incrementDailyLogAndSync(itemIdentity: string, itemType: ItemType, date: string, mealTag: string | null = null): Promise<RawLog> {
  return withDataLock(async () => {
    const log = await incrementDailyLogInternal(itemIdentity, itemType, date, mealTag);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal(logEnqueue(log, userId, "upsert"));
    return log;
  });
}

export function toggleDailyLogAndSync(
  itemIdentity: string,
  itemType: ItemType,
  date: string,
): Promise<{ logged: boolean; added: RawLog | null; removed: RawLog[] }> {
  return withDataLock(async () => {
    const result = await toggleDailyLogInternal(itemIdentity, itemType, date);
    const userId = await currentUserId();
    if (userId) {
      if (result.added) await enqueueOutboxInternal(logEnqueue(result.added, userId, "upsert"));
      for (const removed of result.removed) await enqueueOutboxInternal(logEnqueue(removed, userId, "delete"));
    }
    return result;
  });
}

export function setDailyDurationAndSync(itemIdentity: string, itemType: ItemType, date: string, totalMinutes: number): Promise<RawLog> {
  return withDataLock(async () => {
    const log = await setDailyDurationInternal(itemIdentity, itemType, date, totalMinutes);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal(logEnqueue(log, userId, "upsert"));
    return log;
  });
}

export function decrementDailyLogAndSync(itemIdentity: string, date: string): Promise<RawLog | null> {
  return withDataLock(async () => {
    const removed = await decrementDailyLogInternal(itemIdentity, date);
    if (removed) {
      const userId = await currentUserId();
      if (userId) await enqueueOutboxInternal(logEnqueue(removed, userId, "delete"));
    }
    return removed;
  });
}

export function decrementDailyLogForMealAndSync(itemIdentity: string, date: string, mealTag: string | null): Promise<RawLog | null> {
  return withDataLock(async () => {
    const removed = await decrementDailyLogForMealInternal(itemIdentity, date, mealTag);
    if (removed) {
      const userId = await currentUserId();
      if (userId) await enqueueOutboxInternal(logEnqueue(removed, userId, "delete"));
    }
    return removed;
  });
}

/** Deletes one specific log entry by its own identity. `itemType` is
 * needed (not derivable from the id alone once the row is already gone
 * locally) to know which Supabase table the delete belongs to. */
export function deleteLogByIdAndSync(identity: string, itemType: ItemType): Promise<void> {
  return withDataLock(async () => {
    await deleteLogByIdInternal(identity);
    const userId = await currentUserId();
    if (!userId) return;
    const table = LOG_TABLE[itemType];
    await enqueueOutboxInternal({ userId, table, op: "delete", payload: { id: identity }, dedupeKey: `${table}:${identity}` });
  });
}

export function updateLogMealTagAndSync(identity: string, mealTag: string | null): Promise<RawLog | null> {
  return withDataLock(async () => {
    const updated = await updateLogMealTagInternal(identity, mealTag);
    if (updated) {
      const userId = await currentUserId();
      if (userId) await enqueueOutboxInternal(logEnqueue(updated, userId, "upsert"));
    }
    return updated;
  });
}

export function updateLogTimeAndSync(identity: string, updatedAt: string): Promise<RawLog | null> {
  return withDataLock(async () => {
    const updated = await updateLogTimeInternal(identity, updatedAt);
    if (updated) {
      const userId = await currentUserId();
      if (userId) await enqueueOutboxInternal(logEnqueue(updated, userId, "upsert"));
    }
    return updated;
  });
}

export function setDiaryNoteAndSync(itemIdentity: string, itemType: ItemType, date: string, content: string | null): Promise<RawDiaryEntry> {
  return withDataLock(async () => {
    const entry = await setDiaryNoteInternal(itemIdentity, itemType, date, content);
    const userId = await currentUserId();
    if (userId) {
      const table = DIARY_TABLE[itemType];
      await enqueueOutboxInternal({ userId, table, op: "upsert", payload: buildDiaryRow(entry, userId), dedupeKey: `${table}:${entry.identity}` });
    }
    return entry;
  });
}

export function putCategoryAndSync(entry: RawCategory): Promise<void> {
  return withDataLock(async () => {
    await putCategoryInternal(entry);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "categories", op: "upsert", payload: buildCategoryRow(entry, userId), dedupeKey: `categories:${entry.id}` });
  });
}

export function deleteCategoryAndSync(id: string): Promise<void> {
  return withDataLock(async () => {
    await deleteCategoryLocalInternal(id);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "categories", op: "delete", payload: { id }, dedupeKey: `categories:${id}` });
  });
}

export function putStoolLogAndSync(log: RawStoolLog): Promise<void> {
  return withDataLock(async () => {
    await putStoolLogInternal(log);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "stool_logs", op: "upsert", payload: buildStoolLogRow(log, userId), dedupeKey: `stool_logs:${log.id}` });
  });
}

export function deleteStoolLogByIdAndSync(id: string): Promise<void> {
  return withDataLock(async () => {
    await deleteStoolLogByIdInternal(id);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "stool_logs", op: "delete", payload: { id }, dedupeKey: `stool_logs:${id}` });
  });
}

export function updateStoolLogTimeAndSync(id: string, loggedAt: string): Promise<RawStoolLog | null> {
  return withDataLock(async () => {
    const updated = await updateStoolLogTimeInternal(id, loggedAt);
    if (updated) {
      const userId = await currentUserId();
      if (userId) await enqueueOutboxInternal({ userId, table: "stool_logs", op: "upsert", payload: buildStoolLogRow(updated, userId), dedupeKey: `stool_logs:${id}` });
    }
    return updated;
  });
}

export function putGymLogAndSync(log: RawGymLog): Promise<void> {
  return withDataLock(async () => {
    await putGymLogInternal(log);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "workout_logs", op: "upsert", payload: await buildGymLogRow(log, userId), dedupeKey: `workout_logs:${log.id}` });
  });
}

/** Also fixes a pre-outbox redundancy: the old `deleteGymLog` called
 * `deleteGymLogById` a second time on top of the page already having
 * called it directly — this is now the single call site for both the
 * local delete and the sync side. */
export function deleteGymLogAndSync(id: string): Promise<void> {
  return withDataLock(async () => {
    await deleteGymLogByIdInternal(id);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "workout_logs", op: "delete", payload: { id }, dedupeKey: `workout_logs:${id}` });
  });
}

interface ItemRow {
  id: string;
  name: string;
  category_id: string | null;
  is_archived: boolean | null;
  created_date: string | null;
  reminder_time: string | null;
  /** workout_items only — absent (not just null) from the other four
   * *_items tables, since the column doesn't exist there. */
  unit?: WorkoutUnit | null;
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
  bristol_scores: number[] | null;
  no_bristol: boolean;
  color: string | null;
  floatation: string | null;
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
  item_id: string;
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

  // Best-effort: give any not-yet-synced local writes a chance to reach
  // Supabase BEFORE the destructive clear below, so the snapshot this pull
  // fetches is as fresh as possible. This does not need to succeed or
  // finish quickly for the pull to stay safe — the outbox itself is never
  // cleared by clearAllData (see below), so a write that hasn't synced yet
  // survives this pull either way, just possibly invisible in the local
  // cache until the *next* successful pull after it drains. See the
  // *AndSync functions above and outbox.ts.
  await drainOutbox();

  const categoryRows = await fetchAllRows<CategoryRow>(supabase, "categories");
  const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));

  const [itemsByType, logsByType, diaryByType] = await Promise.all([
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<ItemRow>(supabase!, ITEM_TABLE[t]))),
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<LogRow>(supabase!, LOG_TABLE[t]))),
    Promise.all(ITEM_TYPES.map((t) => fetchAllRows<DiaryRow>(supabase!, DIARY_TABLE[t]))),
  ]);
  // Workout items/diary aren't part of the ITEM_TYPES loop above: workout_logs
  // doesn't match the generic LogRow shape (no meal_tag, and its own
  // GymLogRow type below), so folding "workout" into that shared loop would
  // try to pull it as if it did. workout_logs itself is already pulled
  // below, exactly like stool_logs.
  const [stoolLogRows, gymLogRows, workoutItemRows, workoutDiaryRows] = await Promise.all([
    fetchAllRows<StoolLogRow>(supabase, "stool_logs"),
    fetchAllRows<GymLogRow>(supabase, "workout_logs"),
    fetchAllRows<ItemRow>(supabase, "workout_items"),
    fetchAllRows<DiaryRow>(supabase, "workout_diary"),
  ]);
  const workoutItemNameById = new Map(workoutItemRows.map((item) => [item.id, item.name]));

  // Wiping and repopulating IndexedDB is one atomic unit against
  // withDataLock — see indexedDb.ts. A local write started while this is
  // running waits for it to finish (and vice versa), so a write can never
  // land in the gap between the clear and the repopulation that follows
  // it, and a read right after this resolves (e.g. DataContext's
  // refresh()) can never observe a half-repopulated cache. Every write
  // below uses the *Internal (unlocked) variant, since this callback
  // already holds the lock — calling the locked public versions here
  // would deadlock. Note clearAllDataInternal does NOT touch the outbox
  // store — a pending sync operation is never erased by a pull.
  await withDataLock(async () => {
    await clearAllDataInternal();

    for (const entry of categoryRows) {
      await putCategoryInternal({ id: entry.id, itemType: dbTypeToItemType(entry.item_type), name: entry.name });
    }

    for (let i = 0; i < ITEM_TYPES.length; i++) {
      const itemType = ITEM_TYPES[i];
      for (const row of itemsByType[i]) {
        const item: RawItem = {
          identity: row.id,
          itemType,
          rawName: row.name,
          category: categoryNameById.get(row.category_id ?? "") ?? "Other",
          categoryId: row.category_id,
          isArchived: row.is_archived ?? false,
          createdDate: row.created_date,
          reminderTime: row.reminder_time ? row.reminder_time.slice(0, 5) : null,
          unit: null,
        };
        await putItemInternal(item);
      }
    }

    for (const row of workoutItemRows) {
      const item: RawItem = {
        identity: row.id,
        itemType: "workout",
        rawName: row.name,
        category: categoryNameById.get(row.category_id ?? "") ?? "Other",
        categoryId: row.category_id,
        isArchived: row.is_archived ?? false,
        createdDate: row.created_date,
        reminderTime: null,
        unit: row.unit ?? "kg",
      };
      await putItemInternal(item);
    }

    for (let i = 0; i < ITEM_TYPES.length; i++) {
      const itemType = ITEM_TYPES[i];
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
        await putLogInternal(log);
      }
    }

    for (let i = 0; i < ITEM_TYPES.length; i++) {
      const itemType = ITEM_TYPES[i];
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
        await putDiaryEntryInternal(entry);
      }
    }

    for (const row of workoutDiaryRows) {
      const entry: RawDiaryEntry = {
        identity: row.id,
        itemIdentity: row.item_id,
        itemType: "workout",
        date: row.date,
        content: row.content,
        title: row.title,
        updatedAt: row.updated_at,
      };
      await putDiaryEntryInternal(entry);
    }

    for (const row of stoolLogRows) {
      const log: RawStoolLog = {
        id: row.id,
        date: row.date,
        loggedAt: row.logged_at,
        bristolScores: row.bristol_scores ?? [],
        noBristol: row.no_bristol,
        color: (row.color as StoolColor | null) ?? null,
        floatation: (row.floatation as StoolFloatation | null) ?? null,
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
      await putStoolLogInternal(log);
    }

    for (const row of gymLogRows) {
      const exercise = workoutItemNameById.get(row.item_id);
      if (!exercise) continue; // orphaned row (workout item deleted) — shouldn't happen, FK is on delete restrict
      const log: RawGymLog = {
        id: row.id,
        date: row.date,
        exercise,
        weightKg: row.weight_kg,
        updatedAt: new Date(row.updated_at).getTime(),
      };
      await putGymLogInternal(log);
    }
  });
}

function dbTypeToItemType(dbType: string): ItemType {
  return dbType === "symptom" ? "outcome" : (dbType as ItemType);
}
