import { putCategoryAndSync, putItemAndSync, waitForInitialPull } from "@/lib/supabase/sync";
import { getAllCategories, getAllItems } from "@/lib/db/indexedDb";
import { CATEGORIES_BY_TYPE, type ItemType } from "@/taxonomy/categories";
import { WORKOUT_EXERCISES, type RawCategory, type RawItem } from "@/lib/types";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { normalizeName } from "@/taxonomy/normalizeName";

/**
 * Which names need a real `categories` row before `name` is usable for
 * `itemType`. If this type has never had a single row before, the *whole*
 * built-in default list gets materialized at once (matching the
 * pre-redesign behavior: "the first customization for a type copies the
 * current defaults in, and they become the source of truth from then on")
 * — not just the one name being requested — so the picker doesn't collapse
 * down to a single option the moment someone logs their first item of that
 * type. Once any row exists, only ever-actually-missing names get added.
 *
 * Matches names the same way Supabase's `unique (user_id, item_type,
 * name_key)` constraint does — `normalizeName` (trim + casefold) rather
 * than exact string equality — so e.g. typing "food" when a "Food" row
 * already exists resolves to that row instead of minting a second one that
 * the server then rejects as a duplicate.
 */
function categoryNamesToSeed(itemType: ItemType, name: string, existing: RawCategory[]): string[] {
  const hasAnyRow = existing.some((c) => c.itemType === itemType);
  if (!hasAnyRow) {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const candidate of [...CATEGORIES_BY_TYPE[itemType], name]) {
      const key = normalizeName(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(candidate);
    }
    return names;
  }
  const hasThisName = existing.some((c) => c.itemType === itemType && normalizeName(c.name) === normalizeName(name));
  return hasThisName ? [] : [name];
}

// Serializes ensureCategoryId calls (separate from indexedDb.ts's
// withDataLock, which putCategoryAndSync already holds internally — nesting
// would deadlock). Without this, two calls issued back-to-back for the same
// never-yet-seeded type — e.g. two items added a beat apart, before the
// first call's writes are visible to the second — would each decide "no row
// exists yet" and independently seed a whole duplicate default set under
// fresh ids, which Supabase's name_key uniqueness then rejects for every
// colliding name (surfacing as a dead-lettered outbox entry), while the
// items that got filed under the losing set's ids fail to sync too (their
// category was never actually created server-side).
let categorySeedQueue: Promise<unknown> = Promise.resolve();

/**
 * Resolves a category name to its `categories` row id, creating whatever
 * rows are missing (see `categoryNamesToSeed`) along the way. Every item
 * type — food included — references a category by id (a real FK, `on
 * delete restrict`), so a name alone isn't enough to write an item.
 *
 * Always re-reads categories fresh from IndexedDB rather than trusting a
 * caller-supplied snapshot, which may be stale from before an earlier call
 * (or another tab) wrote to it — see `categorySeedQueue` above for why that
 * matters.
 *
 * Waits for this session's initial cloud pull before reading, when signed
 * in — a "fresh" read taken before that pull has landed is still only as
 * complete as whatever happened to already be cached locally, which for a
 * just-opened/just-reloaded tab can be nothing at all. Without this, that
 * incomplete read looks identical to "this user genuinely has no
 * categories of this type yet", and the exact same duplicate-seeding
 * failure this function already guards against (see `categorySeedQueue`)
 * happens anyway — just from a different trigger (a cold start racing the
 * pull, not two calls racing each other). See `waitForInitialPull`'s own
 * doc comment.
 */
export function ensureCategoryId(itemType: ItemType, name: string): Promise<string> {
  const run = async () => {
    await waitForInitialPull();
    const current = await getAllCategories();
    const found = current.find((c) => c.itemType === itemType && normalizeName(c.name) === normalizeName(name));
    const toSeed = categoryNamesToSeed(itemType, name, current);
    let resultId = found?.id ?? "";
    for (const seedName of toSeed) {
      const id = crypto.randomUUID();
      if (seedName === name) resultId = id;
      const entry: RawCategory = { id, itemType, name: seedName };
      await putCategoryAndSync(entry);
    }
    return resultId;
  };
  const result = categorySeedQueue.then(run, run);
  categorySeedQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Same seeding logic as `ensureCategoryId`, but as plain rows for demo
 * mode's in-memory state instead of writing to IndexedDB/Supabase. */
export function categoryRowsToSeedForDemo(itemType: ItemType, name: string, existing: RawCategory[]): RawCategory[] {
  return categoryNamesToSeed(itemType, name, existing).map((seedName) => ({ id: crypto.randomUUID(), itemType, name: seedName }));
}

// Serializes ensureDefaultWorkoutItems calls, same reasoning as
// categorySeedQueue above: a second /log mount (fast navigate-away-and-back,
// or two tabs) before the first bootstrap's 7 sequential putItemAndSync
// calls finish would otherwise see the same caller-supplied `existingItems`
// snapshot (still empty of workout items), decide "not seeded yet" a
// second time, and mint 14 local rows (2 per exercise, fresh ids each) —
// half of which then permanently dead-letter against workout_items'
// unique(user_id, name_key) constraint.
let workoutSeedQueue: Promise<unknown> = Promise.resolve();

/**
 * Materializes the 7 exercises this app used to hardcode (`WORKOUT_EXERCISES`)
 * as real `workout_items`, all filed under a seeded "Strength Training"
 * category — but only the first time, for a user with zero workout items
 * of their own yet. Mirrors `categoryNamesToSeed`'s "whole default list at
 * once, never again once anything real exists" rule, so the Workout tab
 * isn't empty for a brand-new signed-in user, while still leaving exercise
 * names fully user-editable (rename/archive/add via Manage) from then on.
 *
 * Re-checks with a fresh `getAllItems()` read (not a possibly-stale
 * snapshot the caller loaded earlier) and serializes concurrent calls
 * through `workoutSeedQueue` — see its own comment. Also waits for this
 * session's initial cloud pull first, same reasoning as `ensureCategoryId`
 * — this is exactly what let a returning user's already-created "Squat",
 * "Strength Training", etc. get silently re-seeded under fresh ids on a
 * cold start (a reload, a fresh tab) that raced ahead of the pull that
 * would have shown they already existed.
 */
export function ensureDefaultWorkoutItems(): Promise<void> {
  const run = async () => {
    await waitForInitialPull();
    const current = await getAllItems();
    if (current.some((i) => i.itemType === "workout")) return;
    const categoryId = await ensureCategoryId("workout", "Strength Training");
    const today = todayLocalISODate();
    for (const name of WORKOUT_EXERCISES) {
      const item: RawItem = {
        identity: crypto.randomUUID(),
        itemType: "workout",
        rawName: name,
        category: "Strength Training",
        categoryId,
        isArchived: false,
        createdDate: today,
        reminderTime: null,
        unit: "kg",
      };
      await putItemAndSync(item);
    }
  };
  const result = workoutSeedQueue.then(run, run);
  workoutSeedQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
