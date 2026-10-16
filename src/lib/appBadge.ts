type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Shows `count` on the installed app's icon, or clears it at zero. A no-op
 * where the Badging API is missing (a plain browser tab, Firefox). */
export function setAppBadgeCount(count: number): void {
  if (typeof navigator === "undefined") return;
  const nav = navigator as BadgeNavigator;
  const done = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  // Rejects when notifications aren't allowed (iOS) — nothing to do then.
  done?.catch(() => {});
}
