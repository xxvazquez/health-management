"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { pushNotificationsSupported, disablePushNotifications, enablePushNotifications, isPushNotificationsEnabled } from "@/lib/push";

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3.5c-2.2 0-4 1.8-4 4v2.4c0 .6-.2 1.2-.6 1.7L4.5 12.8a1 1 0 0 0 .8 1.7h9.4a1 1 0 0 0 .8-1.7l-.9-1.2a2.8 2.8 0 0 1-.6-1.7V7.5c0-2.2-1.8-4-4-4Z" />
      <path d="M8.3 16.2a1.9 1.9 0 0 0 3.4 0" fill="none" />
    </svg>
  );
}

/** Enable/disable control for push notifications on this device — the
 * on/off switch reminders are actually delivered through, separate from
 * *when* one fires (that's the per-item reminder time set on the Manage
 * page's supplement/habit rows). Hidden entirely when push isn't usable
 * (unsupported browser, Supabase/VAPID not configured) or nobody's signed
 * in, since a push subscription only means anything tied to an account.
 * Shows a text label alongside the bell rather than relying on a
 * hover-only tooltip — a bare icon button left people unable to tell what
 * clicking it would even do. */
export function PushNotificationsToggle() {
  const { session } = useAuth();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset to "loading" whenever the signed-in user changes, adjusted
  // directly during render (React's documented pattern for this) rather
  // than in an effect, which would fire an extra post-mount render.
  const userId = session?.user.id ?? null;
  const [knownUserId, setKnownUserId] = useState(userId);
  if (userId !== knownUserId) {
    setKnownUserId(userId);
    setEnabled(null);
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    isPushNotificationsEnabled().then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!pushNotificationsSupported || !session || enabled === null) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
      } else {
        await enablePushNotifications();
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy}
        aria-pressed={enabled}
        className="flex items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-xs font-medium disabled:opacity-50"
        style={{
          borderColor: enabled ? "var(--series-1)" : "var(--border-hairline)",
          background: enabled ? "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))" : "var(--surface-1)",
          color: enabled ? "var(--series-1)" : "var(--text-secondary)",
        }}
      >
        <BellIcon on={Boolean(enabled)} />
        {enabled ? "Notifications on" : "Turn on notifications"}
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
