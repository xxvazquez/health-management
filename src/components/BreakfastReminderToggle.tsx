"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { breakfastReminderSupported, disableBreakfastReminder, enableBreakfastReminder, isBreakfastReminderEnabled } from "@/lib/push";

function BellIcon({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3.5c-2.2 0-4 1.8-4 4v2.4c0 .6-.2 1.2-.6 1.7L4.5 12.8a1 1 0 0 0 .8 1.7h9.4a1 1 0 0 0 .8-1.7l-.9-1.2a2.8 2.8 0 0 1-.6-1.7V7.5c0-2.2-1.8-4-4-4Z" />
      <path d="M8.3 16.2a1.9 1.9 0 0 0 3.4 0" fill="none" />
    </svg>
  );
}

/** Enable/disable control for the breakfast logging reminder — hidden
 * entirely when push isn't usable (unsupported browser, Supabase/VAPID not
 * configured) or nobody's signed in, since a push subscription only means
 * anything tied to an account. Lives on the Log page, next to the day
 * navigator — this is the one page the reminder is actually about. */
export function BreakfastReminderToggle() {
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
    isBreakfastReminderEnabled().then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!breakfastReminderSupported || !session || enabled === null) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await disableBreakfastReminder();
        setEnabled(false);
      } else {
        await enableBreakfastReminder();
        setEnabled(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the reminder.");
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
        title={enabled ? "Breakfast reminder is on — click to turn off" : "Turn on a breakfast logging reminder"}
        aria-label={enabled ? "Turn off breakfast reminder" : "Turn on breakfast reminder"}
        aria-pressed={enabled}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border disabled:opacity-50"
        style={{
          borderColor: enabled ? "var(--series-1)" : "var(--border-hairline)",
          background: enabled ? "color-mix(in oklab, var(--series-1) 14%, var(--surface-1))" : "var(--surface-1)",
          color: enabled ? "var(--series-1)" : "var(--text-secondary)",
        }}
      >
        <BellIcon on={Boolean(enabled)} />
      </button>
      {error && (
        <span className="text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
