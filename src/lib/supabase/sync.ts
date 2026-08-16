import { supabase } from "./client";
import {
  getAllDiary,
  getAllEvents,
  getAllHabits,
  getEventsForHabitOnDate,
  getHabit,
  putDiaryEntry,
  putEvent,
  putHabit,
  setUserOverride,
} from "@/lib/db/indexedDb";
import type { OverrideEntry } from "@/taxonomy/classify";
import type { RawDiaryEntry, RawEvent, RawHabit } from "@/lib/types";

/**
 * Pushes everything logged for one habit on one day (from the Log page)
 * to Supabase: upserts the habit's own metadata, then replaces that
 * habit+date's remote rows with whatever's now stored locally. Silently
 * skips imported-origin events — this only syncs what was actually typed
 * or tapped through the Log page, never the bulk historical import.
 *
 * No-op if Supabase isn't configured or nobody's signed in, so local
 * logging always works regardless of cloud state.
 */
export async function syncHabitDay(habitIdentity: string, date: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;
  const userId = session.user.id;

  const habit = await getHabit(habitIdentity);
  if (habit) {
    await supabase.from("habits").upsert({
      identity: habit.identity,
      user_id: userId,
      raw_name: habit.rawName,
      unit: habit.unit,
      kind: habit.kind,
      frequency: habit.frequency,
      is_removed: habit.isRemoved,
      created_date: habit.createdDate,
    });
  }

  const manualEvents = (await getEventsForHabitOnDate(habitIdentity, date)).filter((e) =>
    e.identity.startsWith("manual:"),
  );

  await supabase.from("events").delete().eq("habit_identity", habitIdentity).eq("date", date);
  if (manualEvents.length > 0) {
    await supabase.from("events").insert(
      manualEvents.map((e) => ({
        identity: e.identity,
        user_id: userId,
        habit_identity: e.habitIdentity,
        date: e.date,
        value: e.value,
        goal_value: e.goalValue,
        is_skipped: e.isSkipped,
        updated_at: e.updatedAt,
        meal_tag: e.mealTag,
      })),
    );
  }
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

/** Pulls every cloud row belonging to the signed-in user into IndexedDB. */
export async function pullFromCloud(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return;

  const [habitsRes, eventsRes, overridesRes, diaryRes] = await Promise.all([
    supabase.from("habits").select("*"),
    supabase.from("events").select("*"),
    supabase.from("user_overrides").select("*"),
    supabase.from("diary").select("*"),
  ]);

  for (const row of habitsRes.data ?? []) {
    const habit: RawHabit = {
      identity: row.identity,
      rawName: row.raw_name,
      unit: row.unit,
      kind: row.kind,
      frequency: row.frequency,
      isRemoved: row.is_removed,
      createdDate: row.created_date,
    };
    await putHabit(habit);
  }

  for (const row of eventsRes.data ?? []) {
    const event: RawEvent = {
      identity: row.identity,
      habitIdentity: row.habit_identity,
      date: row.date,
      value: row.value,
      goalValue: row.goal_value,
      isSkipped: row.is_skipped,
      updatedAt: row.updated_at,
      mealTag: row.meal_tag,
    };
    await putEvent(event);
  }

  for (const row of overridesRes.data ?? []) {
    await setUserOverride(row.key, {
      canonicalName: row.canonical_name,
      itemType: row.item_type,
      category: row.category,
      subcategory: row.subcategory,
    });
  }

  for (const row of diaryRes.data ?? []) {
    const entry: RawDiaryEntry = {
      identity: row.identity,
      habitIdentity: row.habit_identity,
      date: row.date,
      content: row.content,
      title: row.title,
      updatedAt: row.updated_at,
    };
    await putDiaryEntry(entry);
  }
}

export interface BulkPushProgress {
  habitsTotal: number;
  habitsDone: number;
  eventsTotal: number;
  eventsDone: number;
  diaryTotal: number;
  diaryDone: number;
}

const BULK_CHUNK_SIZE = 500;

/**
 * One-time migration: pushes *everything* currently in IndexedDB —
 * including the bulk historical import, not just Log-page entries — up to
 * Supabase. Unlike syncHabitDay (which only ever syncs manual: rows), this
 * is an explicit, user-triggered action since it uploads the full history.
 * Chunked because Postgrest has practical limits on a single request's
 * row count/payload size.
 */
export async function pushAllLocalDataToCloud(onProgress?: (p: BulkPushProgress) => void): Promise<void> {
  if (!supabase) throw new Error("Cloud sync isn't configured.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in first.");
  const userId = session.user.id;

  const [habits, events, diary] = await Promise.all([getAllHabits(), getAllEvents(), getAllDiary()]);

  const progress: BulkPushProgress = {
    habitsTotal: habits.length,
    habitsDone: 0,
    eventsTotal: events.length,
    eventsDone: 0,
    diaryTotal: diary.length,
    diaryDone: 0,
  };
  onProgress?.({ ...progress });

  for (let i = 0; i < habits.length; i += BULK_CHUNK_SIZE) {
    const chunk = habits.slice(i, i + BULK_CHUNK_SIZE).map((h) => ({
      identity: h.identity,
      user_id: userId,
      raw_name: h.rawName,
      unit: h.unit,
      kind: h.kind,
      frequency: h.frequency,
      is_removed: h.isRemoved,
      created_date: h.createdDate,
    }));
    const { error } = await supabase.from("habits").upsert(chunk);
    if (error) throw error;
    progress.habitsDone += chunk.length;
    onProgress?.({ ...progress });
  }

  for (let i = 0; i < events.length; i += BULK_CHUNK_SIZE) {
    const chunk = events.slice(i, i + BULK_CHUNK_SIZE).map((e) => ({
      identity: e.identity,
      user_id: userId,
      habit_identity: e.habitIdentity,
      date: e.date,
      value: e.value,
      goal_value: e.goalValue,
      is_skipped: e.isSkipped,
      updated_at: e.updatedAt,
      meal_tag: e.mealTag,
    }));
    const { error } = await supabase.from("events").upsert(chunk);
    if (error) throw error;
    progress.eventsDone += chunk.length;
    onProgress?.({ ...progress });
  }

  for (let i = 0; i < diary.length; i += BULK_CHUNK_SIZE) {
    const chunk = diary.slice(i, i + BULK_CHUNK_SIZE).map((d) => ({
      identity: d.identity,
      user_id: userId,
      habit_identity: d.habitIdentity,
      date: d.date,
      content: d.content,
      title: d.title,
      updated_at: d.updatedAt,
    }));
    const { error } = await supabase.from("diary").upsert(chunk);
    if (error) throw error;
    progress.diaryDone += chunk.length;
    onProgress?.({ ...progress });
  }
}
