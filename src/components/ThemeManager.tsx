"use client";

import { useCallback, useEffect } from "react";
import {
  isDarkPalette,
  isLightPalette,
  isThemePref,
  readDarkPalette,
  readLightPalette,
  readThemePref,
  setDarkPalette,
  setLightPalette,
  setThemePref,
  useThemePref,
  type DarkPalette,
  type LightPalette,
  type ThemePref,
} from "@/lib/theme";
import { usePreferences } from "@/lib/usePreferences";

function currentAppearance() {
  return { theme: readThemePref(), light: readLightPalette(), dark: readDarkPalette() };
}

/** Renders nothing — it keeps the theme subscription (OS `system` changes,
 * other tabs) alive for the whole app, and applies the account's synced
 * appearance on this device. An account with none saved yet takes this
 * device's current choice. */
export function ThemeManager() {
  useThemePref();
  const { prefs, loaded, update } = usePreferences();
  const saved = prefs.appearance;

  useEffect(() => {
    if (!loaded) return;
    const local = currentAppearance();
    if (!saved) {
      if (local.theme !== "system" || local.light !== "l3" || local.dark !== "d1") update({ appearance: local });
      return;
    }
    if (isThemePref(saved.theme) && saved.theme !== local.theme) setThemePref(saved.theme);
    if (isLightPalette(saved.light) && saved.light !== local.light) setLightPalette(saved.light);
    if (isDarkPalette(saved.dark) && saved.dark !== local.dark) setDarkPalette(saved.dark);
  }, [loaded, saved, update]);

  return null;
}

/** The Appearance setters for UI: apply on this device and save to the
 * account so every device follows. */
export function useSetAppearance() {
  const { update } = usePreferences();
  const save = useCallback(() => update({ appearance: currentAppearance() }), [update]);
  return {
    setTheme: useCallback((pref: ThemePref) => (setThemePref(pref), save()), [save]),
    setLight: useCallback((palette: LightPalette) => (setLightPalette(palette), save()), [save]),
    setDark: useCallback((palette: DarkPalette) => (setDarkPalette(palette), save()), [save]),
  };
}
