"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** Tracks the `lg` breakpoint so a tab can render one pane on mobile and a
 * list/detail split on desktop from a single component tree. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(DESKTOP_QUERY);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/** Desktop (`lg`+) list/detail layout for the Medical tabs: the list stays
 * in a left rail while the selected row's detail fills the right pane.
 * Below `lg` it keeps the existing one-pane-at-a-time behaviour — the list,
 * or the detail with its own back control. */
export function MedicalSplit({
  selected,
  list,
  detail,
  placeholder,
}: {
  selected: boolean;
  list: ReactNode;
  detail: ReactNode;
  placeholder: ReactNode;
}) {
  const desktop = useIsDesktop();

  if (!desktop) return <>{selected ? detail : list}</>;

  return (
    <div className="grid items-start gap-5" style={{ gridTemplateColumns: "minmax(0, 19rem) minmax(0, 1fr)" }}>
      <div className="min-w-0">{list}</div>
      <div className="min-w-0">{selected ? detail : placeholder}</div>
    </div>
  );
}

/** The right pane before anything is selected. */
export function DetailPlaceholder({ text }: { text: string }) {
  return (
    <div
      className="flex min-h-48 items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center text-sm"
      style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
    >
      {text}
    </div>
  );
}
