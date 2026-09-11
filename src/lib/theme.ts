"use client";

import { useSyncExternalStore } from "react";

/** Appearance preference — a per-device choice, never synced. `system`
 * tracks the OS `prefers-color-scheme`. */
export type ThemePref = "light" | "dark" | "system";

/** Ground palettes within each mode — also per-device, never synced. `l3`
 * ("Cool Studio White") and `d1` ("Midnight Slate") are the defaults; the
 * others are the alternates offered in Settings → Appearance. Adding one
 * means adding its `[data-palette="…"]` block in globals.css and its entry
 * in `PALETTE_BG` below. */
export type LightPalette = "l1" | "l3" | "l4" | "l5";
export type DarkPalette = "d1" | "d2" | "d4";

const KEY = "lauva-theme";
const LIGHT_PALETTE_KEY = "lauva-palette-light";
const DARK_PALETTE_KEY = "lauva-palette-dark";
const DEFAULT_LIGHT_PALETTE: LightPalette = "l3";
const DEFAULT_DARK_PALETTE: DarkPalette = "d1";
const EVENT = "lauva-theme-change";

/** Each palette's own page-backdrop — drives the browser-chrome
 * `theme-color` meta so an in-app Dark (or a non-default ground) choice
 * still recolours the OS status bar / tab strip correctly, not just the
 * page. Keep in step with the `--page-backdrop` values in globals.css. */
const PALETTE_BG: Record<LightPalette | DarkPalette, string> = {
  l1: "#f6faf9",
  l3: "#f4f6f8",
  l4: "#f7f5fb",
  l5: "#ffffff",
  d1: "#12161b",
  d2: "#181613",
  d4: "#15161c",
};

/** A name + swatch pair for each palette, for the picker in Settings →
 * Appearance — a JS copy of the same values since a swatch has to preview
 * options that *aren't* the currently active `[data-palette]`, so it can't
 * just read the live CSS custom properties. Keep in step with globals.css. */
export const PALETTE_INFO: Record<LightPalette | DarkPalette, { name: string; bg: string; accent: string }> = {
  l1: { name: "Warm Leaf", bg: "#f6faf9", accent: "#3f7d68" },
  l3: { name: "Cool Studio", bg: "#f4f6f8", accent: "#3a7cb8" },
  l4: { name: "Soft Lavender", bg: "#f7f5fb", accent: "#8171b8" },
  l5: { name: "Editorial", bg: "#ffffff", accent: "#1f7a5c" },
  d1: { name: "Midnight Slate", bg: "#1a2027", accent: "#4fb3ab" },
  d2: { name: "Warm Charcoal", bg: "#201d19", accent: "#d3a15a" },
  d4: { name: "Cool Graphite", bg: "#1d1f28", accent: "#7c93e0" },
};

export const LIGHT_PALETTES: readonly LightPalette[] = ["l3", "l1", "l4", "l5"];
export const DARK_PALETTES: readonly DarkPalette[] = ["d1", "d2", "d4"];

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function readLightPalette(): LightPalette {
  try {
    const v = localStorage.getItem(LIGHT_PALETTE_KEY);
    return v === "l1" || v === "l4" || v === "l5" ? v : DEFAULT_LIGHT_PALETTE;
  } catch {
    return DEFAULT_LIGHT_PALETTE;
  }
}

export function readDarkPalette(): DarkPalette {
  try {
    const v = localStorage.getItem(DARK_PALETTE_KEY);
    return v === "d2" || v === "d4" ? v : DEFAULT_DARK_PALETTE;
  } catch {
    return DEFAULT_DARK_PALETTE;
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

/** Stamp the resolved light/dark and ground palette onto <html> and keep
 * the browser-chrome colour in step. The same lines run in the pre-paint
 * script in layout.tsx — keep them equivalent. */
export function applyThemePref(pref: ThemePref): void {
  const dark = resolvesDark(pref);
  const palette = dark ? readDarkPalette() : readLightPalette();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  if (palette === DEFAULT_LIGHT_PALETTE || palette === DEFAULT_DARK_PALETTE) {
    delete document.documentElement.dataset.palette;
  } else {
    document.documentElement.dataset.palette = palette;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", PALETTE_BG[palette]);
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

export function setLightPalette(palette: LightPalette): void {
  try {
    if (palette === DEFAULT_LIGHT_PALETTE) localStorage.removeItem(LIGHT_PALETTE_KEY);
    else localStorage.setItem(LIGHT_PALETTE_KEY, palette);
  } catch {
    // storage blocked — the choice still applies for this session
  }
  applyThemePref(readThemePref());
  window.dispatchEvent(new Event(EVENT));
}

export function setDarkPalette(palette: DarkPalette): void {
  try {
    if (palette === DEFAULT_DARK_PALETTE) localStorage.removeItem(DARK_PALETTE_KEY);
    else localStorage.setItem(DARK_PALETTE_KEY, palette);
  } catch {
    // storage blocked — the choice still applies for this session
  }
  applyThemePref(readThemePref());
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === LIGHT_PALETTE_KEY || e.key === DARK_PALETTE_KEY || e.key === null) {
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

export function useLightPalette(): LightPalette {
  return useSyncExternalStore(subscribe, readLightPalette, () => DEFAULT_LIGHT_PALETTE);
}

export function useDarkPalette(): DarkPalette {
  return useSyncExternalStore(subscribe, readDarkPalette, () => DEFAULT_DARK_PALETTE);
}
