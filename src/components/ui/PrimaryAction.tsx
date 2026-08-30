"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

// Hydration-safe "are we on the client yet" — the server snapshot is
// false, the client's is true, so the portal below only renders after
// hydration with no mismatch and no effect-driven setState.
const noopSubscribe = () => () => {};
const useIsClient = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

/** The one "create something" control — same accent fill and label
 * grammar everywhere it appears. Pass the label as "New <noun>" (or
 * "Log <noun>" for a past event); the "+" is added here.
 *
 * Desktop shows it inline, right-aligned above a list. Mobile shows it as
 * a fixed bottom-right button that stays reachable however far the list
 * has scrolled, sitting just above the bottom nav and below any dialog.
 * The mobile button renders through a portal so it clears any list
 * container that clips or hides its overflow. */
export function PrimaryAction({
  label,
  onClick,
  accent,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  const isClient = useIsClient();

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="hidden shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50 lg:inline-flex"
        style={{ background: accent }}
      >
        + {label}
      </button>

      {isClient &&
        createPortal(
          <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-2xl leading-none text-white shadow-lg transition-opacity hover:opacity-90 disabled:opacity-50 lg:hidden"
            style={{ background: accent, bottom: "calc(env(safe-area-inset-bottom, 0px) + 5rem)" }}
          >
            <span aria-hidden="true">+</span>
          </button>,
          document.body,
        )}
    </>
  );
}
