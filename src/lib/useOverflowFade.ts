"use client";

import { useEffect, useRef } from "react";

/**
 * Attaches a soft fade to whichever edge of a horizontal scroller still has
 * content past it — so a tab strip that scrolls sideways (Log's type tabs,
 * the Analytics domain switcher) shows that more tabs exist off-screen
 * instead of just ending flush at the viewport edge.
 *
 * Sets `--fade-l` / `--fade-r` (0 or 1) on the element; pair with the
 * `.fade-x` class in globals.css, which turns those into a mask.
 */
export function useOverflowFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const maxScroll = el.scrollWidth - el.clientWidth;
      el.style.setProperty("--fade-l", el.scrollLeft > 4 ? "1" : "0");
      el.style.setProperty("--fade-r", el.scrollLeft < maxScroll - 4 ? "1" : "0");
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return ref;
}
