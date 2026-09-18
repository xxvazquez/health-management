"use client";

import { useThemePref, setThemePref, type ThemePref } from "@/lib/theme";

const NEXT: Record<ThemePref, ThemePref> = { light: "dark", dark: "system", system: "light" };
const PREF_LABEL: Record<ThemePref, string> = { light: "Light", dark: "Dark", system: "System" };

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === "light") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="10" cy="10" r="3.6" />
        <path d="M10 2.6v1.8M10 15.6v1.8M17.4 10h-1.8M4.4 10H2.6M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3M15.2 15.2l-1.3-1.3M6.1 6.1 4.8 4.8" />
      </svg>
    );
  }
  if (pref === "dark") {
    return (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" stroke="none">
        <path d="M15.8 12.4A6.6 6.6 0 0 1 7.6 4.2a6.6 6.6 0 1 0 8.2 8.2Z" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="10" cy="10" r="6.6" />
      <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** One-tap appearance cycle (Light → Dark → System → …) as a menu row, the
 * same shape as the links around it, so a preference is never more than a
 * menu-open away — the fuller picker with the current-selection state lives
 * on Settings → Appearance. */
export function ThemeToggleRow({ collapsed }: { collapsed?: boolean }) {
  const pref = useThemePref();
  return (
    <button
      type="button"
      onClick={() => setThemePref(NEXT[pref])}
      aria-label={`Appearance: ${PREF_LABEL[pref]}. Tap to change.`}
      title={collapsed ? `Appearance: ${PREF_LABEL[pref]}` : undefined}
      className={`tap-target flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors hover:bg-[var(--page-plane)] lg:py-2 ${collapsed ? "justify-center px-0" : ""}`}
      style={{ color: "var(--text-secondary)" }}
    >
      <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
        <ThemeIcon pref={pref} />
      </span>
      {!collapsed && (
        <>
          Appearance
          <span className="ml-auto text-xs font-normal" style={{ color: "var(--text-muted)" }}>
            {PREF_LABEL[pref]}
          </span>
        </>
      )}
    </button>
  );
}
