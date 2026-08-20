import { supabase, supabaseConfigured } from "./supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** False if Supabase isn't configured, no VAPID key was built in, or the
 * browser lacks the Push API (e.g. Safari outside an installed PWA). The
 * toggle that uses this just doesn't render rather than showing a control
 * that can't work. */
export const breakfastReminderSupported =
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

/** One row per signed-in user — whether it exists is the enabled state. */
export async function isBreakfastReminderEnabled(): Promise<boolean> {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase.from("push_subscriptions").select("user_id").eq("user_id", session.user.id).maybeSingle();
  return Boolean(data);
}

/** Requests notification permission (only ever called from an explicit
 * user action — the toggle's "on" click), subscribes to push, and saves
 * the subscription server-side so the breakfast-reminder-cron Edge
 * Function can reach this device. */
export async function enableBreakfastReminder(): Promise<void> {
  if (!breakfastReminderSupported || !supabase) throw new Error("Not supported in this browser or deployment.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Sign in first to enable the breakfast reminder.");

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

export async function disableBreakfastReminder(): Promise<void> {
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
