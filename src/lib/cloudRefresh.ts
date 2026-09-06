/**
 * A one-line signal that the app just pulled fresh data from Supabase
 * (sign-in, tab focus, reconnect, the periodic tick, or a manual "Sync
 * now"). DataContext owns those triggers for the tracking domains; the
 * direct-to-Supabase hooks (Medical, Agenda, Wishlist, Notes, Messages)
 * don't share that pull, so they listen here and re-fetch + re-cache their
 * own tables on the same beats.
 *
 * Same shape as notes.ts's `onNotesChanged` — a plain same-tab DOM event,
 * not a Supabase realtime channel. A backgrounded or another-device tab
 * still refreshes on its own focus/poll, exactly as before.
 */
const CLOUD_REFRESH_EVENT = "lauva:cloud-refresh";

export function emitCloudRefresh(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CLOUD_REFRESH_EVENT));
}

/** Subscribes to the event above; returns an unsubscribe function. */
export function onCloudRefresh(handler: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CLOUD_REFRESH_EVENT, handler);
  return () => window.removeEventListener(CLOUD_REFRESH_EVENT, handler);
}
