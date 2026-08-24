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
  putItem,
  putStoolLogInternal,
  deleteStoolLogByIdInternal,
  updateStoolLogTimeInternal,
  putWorkoutLogInternal,
  deleteWorkoutLogByIdInternal,
  putPeriodLogInternal,
  deletePeriodLogByIdInternal,
  clearAllDataInternal,
  enqueueOutboxInternal,
  withDataLock,
  getAllItems,
  getItem,
  getItemIdentitiesWithHistory,
  hasOutboxEntriesSinceInternal,
  getDeadLetterOutboxEntries,
  deleteOutboxEntryById,
  getAllOutboxEntries,
  updateOutboxEntry,
  type NewOutboxEntry,
  type OutboxOperation,
  type OutboxEntry,
} from "@/lib/db/indexedDb";
import { drainOutbox, retryOutboxEntry } from "./outbox";
import type { RawDiaryEntry, RawLog, RawItem, RawWorkoutLog, RawCategory, RawStoolLog, RawPeriodLog, StoolColor, StoolFloatation, PaperCleanliness, WorkoutUnit, PeriodIntensity } from "@/lib/types";
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
// Workout logging stays on its own workout_logs/RawWorkoutLog path (weight per set,
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
  // meal_tag doubles as Food's meal and Supplements' time-of-day tag (see
  // TABS' own comment in log/page.tsx) — both food_logs and
  // supplement_logs have the column; symptom_logs/habit_logs don't, and
  // sending it there would make Supabase reject the whole upsert.
  if (log.itemType === "food" || log.itemType === "supplement") row.meal_tag = log.mealTag;
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
 * app still treats a RawWorkoutLog's `exercise` as a plain display name (see the
 * decision in workoutItemIdByName-style lookups elsewhere) — resolving name
 * -> id is confined to this push boundary so nothing else has to change. */
async function buildWorkoutLogRow(log: RawWorkoutLog, userId: string): Promise<Record<string, unknown>> {
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

function buildPeriodLogRow(log: RawPeriodLog, userId: string): Record<string, unknown> {
  return {
    id: log.id,
    user_id: userId,
    date: log.date,
    intensity: log.intensity,
    collection_methods: log.collectionMethods,
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
 * actually removes the row. Every `*_logs`/`*_diary` table's FK to its item
 * table is `on delete restrict`, so deleting an item with any history
 * would be rejected by Supabase — callers should already have checked
 * `getItemIdentitiesWithHistory()` before offering Delete at all, but that
 * check happens against whatever React state was last loaded, which can go
 * stale (another tab/device logs something for this item in the meantime).
 * This re-verifies freshly, from inside the lock, and throws rather than
 * proceeding if it's now out of date — otherwise the item would vanish
 * locally while its logs are silently orphaned until the next pull
 * restores it (and the delete permanently dead-letters server-side). */
export function deleteItemAndSync(identity: string, itemType: ItemType): Promise<void> {
  return withDataLock(async () => {
    const withHistory = await getItemIdentitiesWithHistory();
    if (withHistory.has(identity)) {
      throw new Error("This item has been logged since it was last checked, so it can no longer be deleted — archive it instead.");
    }
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

export function putWorkoutLogAndSync(log: RawWorkoutLog): Promise<void> {
  return withDataLock(async () => {
    await putWorkoutLogInternal(log);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "workout_logs", op: "upsert", payload: await buildWorkoutLogRow(log, userId), dedupeKey: `workout_logs:${log.id}` });
  });
}

/** Also fixes a pre-outbox redundancy: the old `deleteWorkoutLog` called
 * `deleteWorkoutLogById` a second time on top of the page already having
 * called it directly — this is now the single call site for both the
 * local delete and the sync side. */
export function deleteWorkoutLogAndSync(id: string): Promise<void> {
  return withDataLock(async () => {
    await deleteWorkoutLogByIdInternal(id);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "workout_logs", op: "delete", payload: { id }, dedupeKey: `workout_logs:${id}` });
  });
}

/** Caller (the Cycle Tracker) is responsible for the "at most one row per
 * date" invariant — reusing that date's existing `id` when one already
 * exists, generating a fresh one otherwise — same division of labor as
 * putStoolLogAndSync/putWorkoutLogAndSync, where the id always comes in
 * already decided. */
export function putPeriodLogAndSync(log: RawPeriodLog): Promise<void> {
  return withDataLock(async () => {
    await putPeriodLogInternal(log);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "period_logs", op: "upsert", payload: buildPeriodLogRow(log, userId), dedupeKey: `period_logs:${log.id}` });
  });
}

export function deletePeriodLogAndSync(id: string): Promise<void> {
  return withDataLock(async () => {
    await deletePeriodLogByIdInternal(id);
    const userId = await currentUserId();
    if (userId) await enqueueOutboxInternal({ userId, table: "period_logs", op: "delete", payload: { id }, dedupeKey: `period_logs:${id}` });
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

interface WorkoutLogRow {
  id: string;
  date: string;
  item_id: string;
  weight_kg: number;
  updated_at: string;
}

interface PeriodLogRow {
  id: string;
  date: string;
  intensity: PeriodIntensity;
  collection_methods: string[] | null;
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

// ---------------------------------------------------------------------------
// Initial-pull gate
// ---------------------------------------------------------------------------
// Tracks whether pullFromCloud has successfully installed at least one
// snapshot for the CURRENTLY signed-in user since this tab last saw a
// sign-in for them. Exists for one reason: anything that decides "no rows
// exist yet for this type, materialize the built-in defaults" (
// categoryResolution.ts's ensureCategoryId/ensureDefaultWorkoutItems) reads
// local IndexedDB directly — and if that read happens to run before the
// FIRST pull of a fresh session has installed the user's real, already-
// synced categories/items, it sees an empty cache and concludes "nothing
// here yet", seeding a full duplicate default set under brand-new ids. Each
// of those then permanently dead-letters against Supabase's own name
// uniqueness constraint (23505), and any item that got filed under one of
// them fails right along with it (23503, its category was never actually
// created). This is NOT the same race `categorySeedQueue`/`workoutSeedQueue`
// already close (two ensureCategoryId calls overlapping IN THE SAME TAB) —
// this is "ran once, but before the pull that would have shown it wasn't
// actually empty" — which is far more likely right after a fresh cold
// start (a reload, a new tab, the service worker forcing a reload after a
// deploy) than in an already-warm session that's had a pull land already.
let initialPullState: { userId: string; done: boolean; promise: Promise<void>; resolve: () => void } | null = null;

function ensurePullState(userId: string) {
  if (initialPullState && initialPullState.userId === userId) return initialPullState;
  let resolve!: () => void;
  const promise = new Promise<void>((res) => (resolve = res));
  initialPullState = { userId, done: false, promise, resolve };
  return initialPullState;
}

/** Resolves once this tab has confirmed there's nothing to wait for — no
 * session at all, so there's no cloud data that could be missed — or the
 * signed-in user's first pull this session has finished installing. Called
 * by ensureCategoryId/ensureDefaultWorkoutItems before they ever decide "no
 * rows yet, seed the defaults" — see the comment above `initialPullState`.
 * Never resolves the FIRST time until pullFromCloud actually finishes
 * (successfully or by giving up after MAX_PULL_ATTEMPTS — either way,
 * `markInitialPullDone` below runs in every code path that returns), so a
 * user with no network at all isn't stuck forever: it just proceeds with
 * whatever pullFromCloud managed to leave in the local cache. */
export async function waitForInitialPull(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const state = ensurePullState(session.user.id);
  if (state.done) return;
  await state.promise;
}

/** Marks this user's initial-pull gate open — called once pullFromCloud has
 * done everything it's going to do for this call, whether or not it
 * actually managed to install a fresh snapshot (see pullFromCloud's own
 * comment on giving up after MAX_PULL_ATTEMPTS). A pull that never
 * completes at all (offline, no session) must not leave
 * ensureCategoryId/ensureDefaultWorkoutItems waiting forever — they're
 * still allowed to seed defaults from whatever's already cached locally in
 * that case, same as before this gate existed. */
function markInitialPullDone(userId: string): void {
  const state = ensurePullState(userId);
  if (state.done) return;
  state.done = true;
  state.resolve();
}

/** Resets the initial-pull gate — called on sign-out (see DataContext.tsx)
 * so a later sign-in, whether the same user again or a different one on a
 * shared device, correctly waits for its own fresh pull rather than
 * incorrectly reusing a previous user's already-resolved gate. */
export function resetInitialPullState(): void {
  initialPullState = null;
}

// All five item tables (categories' own `item_type` check constraint lists
// the same five DB-spelled values — see schema.sql) — used below to scope
// the dead-letter repair pass to exactly the tables that can hit the
// stale-category-reference/duplicate-name failure shapes it fixes.
const ALL_ITEM_TABLES = new Set<string>(Object.values(ITEM_TABLE));
// The *_logs/*_diary tables — every one of them FKs to its item table on
// `item_id`, so a dead-lettered row here is only ever waiting on that same
// item to land first (its own payload never changes when the item's
// category does — item_id is stable). Used by retryDependentDeadLetters
// below to find which dead letters are worth another try once an item gets
// one.
const ALL_LOG_AND_DIARY_TABLES = new Set<string>([...Object.values(LOG_TABLE), ...Object.values(DIARY_TABLE)]);

/**
 * After an item's own dead-lettered upsert gets a fresh chance to land
 * (repaired automatically below, or retried by hand via
 * retryDeadLetterEntry), any dead-lettered log/diary entries that were only
 * stuck because THIS item hadn't reached Supabase yet get the same fresh
 * chance too — their own payload was always correct (item_id doesn't
 * change when an item's category does), so once the item exists
 * server-side a plain retry is all they need. Without this, a user has to
 * separately notice and retry each dependent log by hand even after fixing
 * the item that was blocking it — exactly the "retry doesn't work" shape a
 * dead-lettered symptom log tied to a dead-lettered symptom item produces.
 * Harmless to call even when the item's own retry fails again: the
 * dependent entries just fail identically and stay dead-lettered, same as
 * if nothing had called this.
 */
async function retryDependentDeadLetters(userId: string, itemIdentity: string): Promise<void> {
  const deadLetters = await getDeadLetterOutboxEntries(userId);
  for (const entry of deadLetters) {
    if (entry.op !== "upsert" || !ALL_LOG_AND_DIARY_TABLES.has(entry.table)) continue;
    const payload = entry.payload as { item_id?: string } | null;
    if (payload?.item_id !== itemIdentity) continue;
    await retryOutboxEntry(entry.id);
  }
}

interface RepairPlan {
  /** Dead-letter entry ids that are unconditionally safe to give up on —
   * either a 23505 (a name collision that can never resolve for that exact
   * payload), or a 23503 item upsert whose item is already gone locally
   * (nothing left to repair it from). */
  toDiscard: string[];
  /** Dead-letter entry id + the corrected item to re-save in its place,
   * for a 23503 item upsert whose item still exists locally right now, re-
   * pointed at the category the fresh pull is about to confirm is real. */
  toRepair: { entryId: string; item: RawItem }[];
}

/**
 * READ half of the dead-letter repair pass — must run BEFORE the
 * destructive clear+repopulate below, while a still-unsynced local item
 * (if any) is still there to read. Deciding what to do about it and
 * actually writing the fix happens after, in `applyRepairPlan`, once the
 * fresh categories are the ones on record — see that function's own
 * comment for why this exists and the two shapes it handles.
 */
async function buildRepairPlan(userId: string): Promise<RepairPlan> {
  const deadLetters = await getDeadLetterOutboxEntries(userId);
  const plan: RepairPlan = { toDiscard: [], toRepair: [] };
  for (const entry of deadLetters) {
    if (entry.op !== "upsert") continue;
    const isCategoryTable = entry.table === "categories";
    const isItemTable = ALL_ITEM_TABLES.has(entry.table);
    if (!isCategoryTable && !isItemTable) continue;

    if (entry.lastErrorCode === "23505") {
      plan.toDiscard.push(entry.id);
      continue;
    }

    if (isItemTable && entry.lastErrorCode === "23503") {
      const identity = (entry.payload as { id?: string } | null)?.id;
      if (!identity) continue;
      const item = await getItem(identity);
      if (!item) continue; // already evicted — nothing left to safely repair from
      plan.toRepair.push({ entryId: entry.id, item });
    }
  }
  return plan;
}

/**
 * WRITE half of the dead-letter repair pass — cleans up outbox entries
 * left behind by the race `waitForInitialPull` (above) now closes:
 * ensureCategoryId/ensureDefaultWorkoutItems running before this session's
 * first pull had installed the user's real, already-synced
 * categories/items, concluding "nothing here yet", and seeding a full
 * duplicate default set under brand-new ids. Closing that race only stops
 * NEW occurrences; it does nothing for entries that got stuck before this
 * shipped, which is what this repairs — run once after every successful
 * pull install, using the fresh snapshot that pull just installed. Two
 * shapes, matching `RepairPlan`'s two lists:
 *
 *  - `toDiscard`: unconditionally, permanently unrecoverable by retrying
 *    the same payload — either a 23505 (that error code means a row with
 *    that exact name already exists, so the real, already-synced version
 *    of whatever this was trying to create is sitting right in the
 *    snapshot just installed) or a 23503 whose item is already gone (see
 *    `buildRepairPlan`). Nothing to repair either way; just stop asking
 *    them to retry forever.
 *  - `toRepair`: a 23503 item upsert whose item still existed locally at
 *    the moment `buildRepairPlan` ran (BEFORE the destructive clear that
 *    just happened wiped it, since it was never actually in Supabase to
 *    survive that clear) — re-resolve its category by matching (itemType,
 *    its own already-correct `category` display name) against the
 *    categories just installed, and write the corrected categoryId back
 *    via `putItemAndSync`, which both restores the item to the
 *    freshly-cleared local cache AND enqueues a fresh, correct upsert that
 *    supersedes the stale dead-lettered one — then gives any dead-lettered
 *    logs/diary notes that were only stuck waiting on this item a fresh
 *    retry too (see `retryDependentDeadLetters`). When no category by that
 *    name exists any more (a real deletion, not this race), there's
 *    nothing to auto-repair — but the item still gets restored to the
 *    freshly-cleared local cache as-is, so it doesn't silently vanish from
 *    Manage. Without that, a genuinely deleted category leaves the item
 *    dead-lettered AND invisible, with no way for the user to act on the
 *    "check it still has a valid category" guidance SyncStatusBanner gives
 *    them, since there'd be nothing left locally to re-point at a new one.
 *
 * Scoped to `userId` throughout (every dead-letter entry `buildRepairPlan`
 * read already came pre-filtered to it by getDeadLetterOutboxEntries) —
 * never touches another account's queued entries, same as every other
 * outbox operation.
 */
async function applyRepairPlan(plan: RepairPlan, categoryRows: CategoryRow[], userId: string): Promise<void> {
  if (plan.toDiscard.length === 0 && plan.toRepair.length === 0) return;

  for (const id of plan.toDiscard) {
    await deleteOutboxEntryById(id);
  }

  if (plan.toRepair.length === 0) return;
  const categoryIdByTypeAndName = new Map<string, string>();
  for (const row of categoryRows) {
    categoryIdByTypeAndName.set(`${row.item_type}:${normalizeName(row.name)}`, row.id);
  }
  for (const { entryId, item } of plan.toRepair) {
    const correctCategoryId = categoryIdByTypeAndName.get(`${DB_TYPE[item.itemType]}:${normalizeName(item.category)}`);
    if (!correctCategoryId || correctCategoryId === item.categoryId) {
      await putItem(item);
      continue;
    }
    await deleteOutboxEntryById(entryId);
    await putItemAndSync({ ...item, categoryId: correctCategoryId });
    await retryDependentDeadLetters(userId, item.identity);
  }
}

/**
 * Re-derives a dead-letter entry's payload from whatever the record it
 * represents looks like locally RIGHT NOW, instead of the frozen snapshot
 * captured back when the original upsert first failed. Without this,
 * clicking Retry on an item that's since been fixed through the UI (e.g.
 * recategorized away from a category that no longer exists — exactly what
 * Manage's own "duplicate conflict"/recategorize flows do) just resends
 * the exact same broken payload and fails identically forever: the fix
 * already made never reaches this stuck entry, because the entry doesn't
 * know the fix happened. Only items currently know how to rebuild
 * themselves this way (buildItemRow is pure — it only needs the item row
 * and userId); categories have no rename path (see categoryResolution.ts)
 * so there's nothing about a category upsert that could have changed since
 * it was queued, and every other table's *AndSync function always builds a
 * FRESH outbox entry on every edit rather than reusing this retry path.
 * Returns null when there's nothing to refresh from — not an upsert, not
 * an item table, or the record no longer exists locally (see
 * `applyRepairPlan`'s own reasoning for why that last case can't be
 * guessed at) — in which case the caller should fall back to resending the
 * entry's existing payload unchanged.
 */
async function refreshedOutboxPayload(entry: OutboxEntry): Promise<Record<string, unknown> | null> {
  if (entry.op !== "upsert" || !ALL_ITEM_TABLES.has(entry.table)) return null;
  const identity = (entry.payload as { id?: string } | null)?.id;
  if (!identity) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  const item = await getItem(identity);
  if (!item) return null;
  return buildItemRow(item, userId);
}

/**
 * The actual "Retry" action behind SyncStatusBanner's button — re-derives
 * the entry's payload first (see `refreshedOutboxPayload`), so a record
 * that's since been fixed locally gets a real chance to sync instead of
 * repeating the exact same failure, then hands off to
 * `retryOutboxEntry` (outbox.ts) for the actual "back to pending, drain
 * now" mechanics, same as before this existed. When the entry being
 * retried is an item, also gives any dead-lettered logs/diary notes
 * waiting on that same item a fresh retry (see
 * `retryDependentDeadLetters`) — otherwise a user who fixes and retries a
 * dead-lettered item still has to separately notice and retry every
 * dead-lettered log tied to it by hand.
 */
export async function retryDeadLetterEntry(id: string): Promise<void> {
  const entry = (await getAllOutboxEntries()).find((e) => e.id === id);
  if (entry) {
    const freshPayload = await refreshedOutboxPayload(entry);
    if (freshPayload) await updateOutboxEntry(id, { payload: freshPayload });
  }
  await retryOutboxEntry(id);
  if (entry?.op === "upsert" && ALL_ITEM_TABLES.has(entry.table)) {
    const identity = (entry.payload as { id?: string } | null)?.id;
    const userId = await currentUserId();
    if (identity && userId) await retryDependentDeadLetters(userId, identity);
  }
}

/** How many times pullFromCloud will re-fetch and retry after detecting a
 * local write raced in after its snapshot (see the loop in pullFromCloud
 * below). Each retry is cheap relative to how rare a real collision is —
 * this is just a safety margin, not tuned against any measurement. */
const MAX_PULL_ATTEMPTS = 3;

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
  const userId = session.user.id;

  // Best-effort: give any not-yet-synced local writes a chance to reach
  // Supabase BEFORE the destructive clear below, so the snapshot this pull
  // fetches is as fresh as possible. This does not need to succeed or
  // finish quickly for the pull to stay safe — the outbox itself is never
  // cleared by clearAllData (see below), so a write that hasn't synced yet
  // survives this pull either way, just possibly invisible in the local
  // cache until the *next* successful pull after it drains. See the
  // *AndSync functions above and outbox.ts.
  await drainOutbox();

  // The fetches below (network round-trips) and the *AndSync functions'
  // local writes are NOT mutually locked — deliberately: holding
  // withDataLock for the whole multi-second fetch would freeze every local
  // write (a food tap, etc.) until the pull finishes, which is worse than
  // the race it would prevent. That leaves a real window: a local write can
  // land after the snapshot below is fetched but before the lock is
  // acquired to install it, and the destructive clear+repopulate would then
  // wipe that write from IndexedDB without it being in the snapshot (its
  // outbox entry survives — clearAllDataInternal never touches that store —
  // so nothing is permanently lost, but the record would be invisible in
  // the local cache until a later pull happens to land cleanly).
  //
  // Closed by marking the moment right before fetching starts, then — from
  // inside the same lock that's about to do the destructive clear —
  // checking whether any outbox entry for this user was created at or
  // after that moment. If so, a write really did race in: skip installing
  // this now-stale snapshot and re-fetch a fresh one instead, up to
  // MAX_PULL_ATTEMPTS times. On the (extremely unlikely) exhaustion of all
  // attempts, this pull simply gives up and leaves the local cache as-is
  // rather than risk wiping a write it can't account for — the next pull
  // trigger (tab focus, the periodic timer, another sign-in) tries again.
  for (let attempt = 0; attempt < MAX_PULL_ATTEMPTS; attempt++) {
    const pullStartedAt = Date.now();

    const categoryRows = await fetchAllRows<CategoryRow>(supabase, "categories");
    const categoryNameById = new Map(categoryRows.map((c) => [c.id, c.name]));

    const [itemsByType, logsByType, diaryByType] = await Promise.all([
      Promise.all(ITEM_TYPES.map((t) => fetchAllRows<ItemRow>(supabase!, ITEM_TABLE[t]))),
      Promise.all(ITEM_TYPES.map((t) => fetchAllRows<LogRow>(supabase!, LOG_TABLE[t]))),
      Promise.all(ITEM_TYPES.map((t) => fetchAllRows<DiaryRow>(supabase!, DIARY_TABLE[t]))),
    ]);
    // Workout items/diary aren't part of the ITEM_TYPES loop above: workout_logs
    // doesn't match the generic LogRow shape (no meal_tag, and its own
    // WorkoutLogRow type below), so folding "workout" into that shared loop would
    // try to pull it as if it did. workout_logs itself is already pulled
    // below, exactly like stool_logs.
    const [stoolLogRows, workoutLogRows, workoutItemRows, workoutDiaryRows, periodLogRows] = await Promise.all([
      fetchAllRows<StoolLogRow>(supabase, "stool_logs"),
      fetchAllRows<WorkoutLogRow>(supabase, "workout_logs"),
      fetchAllRows<ItemRow>(supabase, "workout_items"),
      fetchAllRows<DiaryRow>(supabase, "workout_diary"),
      fetchAllRows<PeriodLogRow>(supabase, "period_logs"),
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
    //
    // buildRepairPlan reads dead-lettered entries and, for a 23503 item
    // upsert, the item itself — which MUST happen before clearAllDataInternal
    // below, since a dead-lettered item's own upsert never reached Supabase
    // and would otherwise be silently wiped by the clear before there was
    // any chance to read (and repair) it. See applyRepairPlan's own doc
    // comment for what happens with what's captured here.
    const repairPlan = await buildRepairPlan(userId);
    const installed = await withDataLock(async () => {
      if (await hasOutboxEntriesSinceInternal(userId, pullStartedAt)) return false;

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
            mealTag: itemType === "food" || itemType === "supplement" ? (row.meal_tag ?? null) : null,
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

      for (const row of workoutLogRows) {
        const exercise = workoutItemNameById.get(row.item_id);
        if (!exercise) continue; // orphaned row (workout item deleted) — shouldn't happen, FK is on delete restrict
        const log: RawWorkoutLog = {
          id: row.id,
          date: row.date,
          exercise,
          weightKg: row.weight_kg,
          updatedAt: new Date(row.updated_at).getTime(),
        };
        await putWorkoutLogInternal(log);
      }

      for (const row of periodLogRows) {
        const log: RawPeriodLog = {
          id: row.id,
          date: row.date,
          intensity: row.intensity,
          collectionMethods: row.collection_methods ?? [],
          updatedAt: new Date(row.updated_at).getTime(),
        };
        await putPeriodLogInternal(log);
      }
      return true;
    });
    if (installed) {
      markInitialPullDone(userId);
      await applyRepairPlan(repairPlan, categoryRows, userId);
      return;
    }
  }
  // Every attempt hit a genuine race (an outbox entry kept appearing after
  // each fresh fetch) — vanishingly unlikely in practice. Leave the local
  // cache exactly as it is rather than risk installing a stale snapshot;
  // the next pull trigger (tab focus, the periodic timer, another sign-in)
  // will try again. Still open the initial-pull gate — see
  // waitForInitialPull's own doc comment on why a pull that can't fully
  // land must not leave ensureCategoryId/ensureDefaultWorkoutItems waiting
  // forever.
  markInitialPullDone(userId);
}

function dbTypeToItemType(dbType: string): ItemType {
  return dbType === "symptom" ? "outcome" : (dbType as ItemType);
}
