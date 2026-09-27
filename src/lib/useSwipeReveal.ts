"use client";

import { useRef, useState, type TouchEvent } from "react";

/**
 * Local reveal state for a list row's trailing edit/delete icons — kept out
 * of the way until wanted instead of sitting permanently on every row. A
 * mouse hovering (or keyboard-focusing) the row reveals them via CSS
 * (`group-hover` / `group-focus-within` on the actions container); touch,
 * which has no hover, needs an explicit trigger, so a left swipe sets
 * `revealed` and a right swipe clears it.
 *
 * Pair `onTouchStart`/`onTouchEnd` with the row (also give the row
 * `style={{ touchAction: "pan-y" }}` so vertical list scrolling still
 * works), and gate the actions container's opacity on `revealed` plus the
 * `group-hover`/`group-focus-within` classes.
 */
export function useSwipeReveal() {
  const [revealed, setRevealed] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    if (dx < -32) setRevealed(true);
    else if (dx > 32) setRevealed(false);
  }

  return { revealed, onTouchStart, onTouchEnd };
}

/** Tailwind classes for a row's trailing actions container. Hidden actions
 * take no room (out of the layout, so no flex gap either), so a row's trailing text (a date, a count) sits at its edge;
 * a swipe opens them on a phone, and from `lg` hovering or focusing the row
 * does. */
export const SWIPE_REVEAL_CLASS = {
  shown: "opacity-100",
  hidden:
    "absolute w-0 overflow-hidden pointer-events-none opacity-0 lg:group-hover:static lg:group-hover:-my-1 lg:group-hover:w-auto lg:group-hover:overflow-visible lg:group-hover:pointer-events-auto lg:group-hover:opacity-100 lg:group-focus-within:static lg:group-focus-within:-my-1 lg:group-focus-within:w-auto lg:group-focus-within:overflow-visible lg:group-focus-within:pointer-events-auto lg:group-focus-within:opacity-100",
};
