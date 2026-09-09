"use client";

import { useThemePref } from "@/lib/theme";

/** Renders nothing — it exists so the theme subscription (OS `system`
 * changes, and the choice syncing across tabs) stays alive for the whole
 * app, not just while the Settings control is mounted. */
export function ThemeManager() {
  useThemePref();
  return null;
}
