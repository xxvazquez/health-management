import { hasPendingOutboxEntry } from "@/lib/db/indexedDb";
import { withSendTimeout } from "@/lib/supabase/outbox";

const chains = new Map<string, Promise<void>>();

/**
 * Saves a one-row-per-user setting (preferences, the colour palette) one
 * change at a time, each applied onto the latest copy on the server — so
 * quick changes can't land out of order, and an edit made on another device
 * isn't overwritten by this one's older copy. Offline, or while an earlier
 * save is still queued, `local` is the base instead.
 */
export function queueRowSave<T>({
  table,
  userId,
  local,
  fetchLatest,
  change,
  save,
}: {
  table: string;
  userId: string;
  local: T;
  fetchLatest: () => Promise<T>;
  change: (base: T) => T;
  save: (value: T) => Promise<void>;
}): Promise<void> {
  const key = `${table}:${userId}`;
  const run = async () => {
    const queued = await hasPendingOutboxEntry(userId, key);
    const base = queued ? local : await withSendTimeout(fetchLatest()).catch(() => local);
    await save(change(base));
  };
  const saved = (chains.get(key) ?? Promise.resolve()).then(run, run);
  chains.set(
    key,
    saved.catch(() => undefined),
  );
  return saved;
}
