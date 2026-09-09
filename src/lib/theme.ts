"use client";

import { useSyncExternalStore } from "react";

/** Appearance preference — a per-device choice, never synced. `system`
 * tracks the OS `prefers-color-scheme`. */
export type ThemePref = "light" | "dark" | "system";

const KEY = "lauva-theme";
const EVENT = "lauva-theme-change";
const LIGHT_COLOR = "#e6f1f2";
const DARK_COLOR = "#151b1e";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function resolvesDark(pref: ThemePref): boolean {
  if (pref === "dark") return true;
  if (pref === "light") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return false;
  }
}

/** Stamp the resolved light/dark onto <html> and keep the browser-chrome
 * colour in step. The same three lines run in the pre-paint script in
 * layout.tsx — keep them equivalent. */
export function applyThemePref(pref: ThemePref): void {
  const dark = resolvesDark(pref);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? DARK_COLOR : LIGHT_COLOR);
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch {
    // storage blocked — the choice still applies for this session
  }
  applyThemePref(pref);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      applyThemePref(readThemePref());
      onChange();
    }
  };
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => {
    if (readThemePref() === "system") applyThemePref("system");
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  mq.addEventListener("change", onSystemChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    mq.removeEventListener("change", onSystemChange);
  };
}

/** Current preference, reactive to the Settings control, other tabs, and
 * (in `system` mode) the OS switching. Mount it once app-wide (ThemeManager)
 * to keep the OS listener alive everywhere, and read it in the control. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readThemePref, () => "system");
}
