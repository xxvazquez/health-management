"use client";

import { useThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
const PREF_LABEL: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "System" };

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === "light") {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 2.6v1.8M10 15.6v1.8M17.4 10h-1.8M4.4 10H2.6M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3M15.2 15.2l-1.3-1.3M6.1 6.1 4.8 4.8" />
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" stroke="none">
        <path d="M15.8 12.4A6.6 6.6 0 0 1 7.6 4.2a6.6 6.6 0 1 0 8.2 8.2Z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** One-tap appearance cycle (Light → Dark → System → …), placed at the top
 * of the nav so a preference is never more than a menu-open away — the
 * fuller picker with the current-selection state lives on Settings →
 * Appearance, this is the quick path for everywhere else. */
export function ThemeToggleButton({ className }: { className?: string }) {
  const pref = useThemePref();
  return (
    <button
      type="button"
      onClick={() => setThemePref(NEXT[pref])}
      aria-label={`Appearance: ${PREF_LABEL[pref]}. Tap to change.`}
      title={`Appearance: ${PREF_LABEL[pref]}`}
      className={`tap-target flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${className ?? ""}`}
      style={{ color: "var(--text-primary)", background: "var(--page-plane)" }}
    >
      <ThemeIcon pref={pref} />
    </button>
  );
}
