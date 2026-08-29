"use client";

import { useCallback, useRef } from "react";

/**
 * Attaches a soft fade to whichever edge of a horizontal scroller still has
 * content past it — so a strip that scrolls sideways (Log's type tabs and
 * day timeline, the Analytics domain switcher) shows there's more off-screen
 * instead of ending flush at the viewport edge.
 *
 * Returns a callback ref, so it works even when the scroller mounts later
 * than the component (e.g. the timeline, which only renders once there's
 * something logged). Sets `--fade-l` / `--fade-r` (0 or 1) on the element;
 * pair with the `.fade-x` class in globals.css, which turns those into a
 * mask.
 */
export function useOverflowFade<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.style.setProperty("--fade-l", el.scrollLeft > 4 ? "1" : "0");
      el.style.setProperty("--fade-r", el.scrollLeft < maxScroll - 4 ? "1" : "0");
    };

    update();
    requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    cleanupRef.current = () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
}
