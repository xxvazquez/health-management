"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { enablePushNotifications, ensurePushNotifications } from "@/lib/push";

/** Keeps notifications on for a signed-in account unless it switched them
 * off in Settings. Re-subscribes silently when permission is granted; when
 * it hasn't been asked yet, asks on the first tap of this launch, since
 * browsers (iOS strictly) only show the prompt from a user gesture. */
export function PushNotificationsAutoEnable() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const askOnTap = () => {
      // Called straight from the tap so the permission prompt is allowed.
      enablePushNotifications().catch(() => {});
    };
    ensurePushNotifications(userId)
      .then((state) => {
        if (!cancelled && state === "needs-permission") document.addEventListener("click", askOnTap, { capture: true, once: true });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      document.removeEventListener("click", askOnTap, { capture: true });
    };
  }, [userId]);

  return null;
}
