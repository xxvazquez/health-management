import { supabase, supabaseConfigured } from "./supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** False if Supabase isn't configured, no VAPID key was built in, or the
 * browser lacks the Push API (e.g. Safari outside an installed PWA). The
 * toggle that uses this just doesn't render rather than showing a control
 * that can't work. */
export const pushNotificationsSupported =
  supabaseConfigured &&
  Boolean(VAPID_PUBLIC_KEY) &&
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** A DB row existing is necessary but not sufficient — it only proves some
 * device once subscribed for this account, and never gets cleaned up if
 * *this* device's own grant quietly dies (a Home Screen icon removed and
 * re-added, a Safari data clear, an iOS update resetting permissions all
 * do this) since the push service can keep accepting sends to the old
 * endpoint for a while with no error. Left unchecked, the toggle claims
 * "Notifications on" forever even after this device can no longer show
 * anything. So the row is only trusted once this device's own live state
 * — OS permission plus an actual subscription — confirms it; a mismatch
 * clears the row and reports disabled, since re-subscribing needs a fresh
 * user gesture (the toggle's own click) rather than happening silently
 * here. Also opportunistically refreshes the stored IANA timezone if it's
 * drifted from the browser's current one (e.g. the user travelled), via a
 * plain UPDATE — not upsert, so it can't fail on the table's other NOT
 * NULL columns — since this table isn't part of the outbox/RawItem sync
 * system at all; every call to it, this one included, talks to Supabase
 * directly. Called every time PushNotificationsToggle mounts, i.e. every
 * page load while signed in, so drift gets caught the next time the app is
 * actually open rather than staying stale until the user toggles off/on. */
export async function isPushNotificationsEnabled(): Promise<boolean> {
  if (!supabase || !pushNotificationsSupported) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase.from("push_subscriptions").select("user_id, timezone").eq("user_id", session.user.id).maybeSingle();
  if (!data) return false;

  if (Notification.permission !== "granted") {
    await supabase.from("push_subscriptions").delete().eq("user_id", session.user.id);
    return false;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    await supabase.from("push_subscriptions").delete().eq("user_id", session.user.id);
    return false;
  }

  const currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (data.timezone !== currentTimezone) {
    await supabase.from("push_subscriptions").update({ timezone: currentTimezone }).eq("user_id", session.user.id);
  }
  return true;
}

/** Requests notification permission (only ever called from an explicit
 * user action — the toggle's "on" click), subscribes to push, and saves
 * the subscription server-side so the breakfast-reminder-cron Edge
 * Function can reach this device. */
export async function enablePushNotifications(): Promise<void> {
  if (!pushNotificationsSupported || !supabase) throw new Error("Not supported in this browser or deployment.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in first to enable notifications.");

  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY as string),
    }));

  const json = subscription.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_id: session.user.id,
    endpoint: json.endpoint,
    p256dh: json.keys?.p256dh,
    auth_key: json.keys?.auth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (error) throw error;
}

export async function disablePushNotifications(): Promise<void> {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    await supabase.from("push_subscriptions").delete().eq("user_id", session.user.id);
  }
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
}
