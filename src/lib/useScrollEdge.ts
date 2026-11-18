"use client";

import { useCallback, useRef } from "react";

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** A pinned bar's scroll edge, as in iOS 27: a callback ref that sets
 * `data-stuck` on the bar while content is scrolled underneath it, so
 * `[data-scroll-edge][data-stuck]` (globals.css) draws its hairline only
 * then. Works in the page or inside a scrolling sheet. */
export function useScrollEdge<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    el.setAttribute("data-scroll-edge", "");
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const scroller = scrollParent(el);
        const scrolled = scroller ? scroller.scrollTop > 0 : window.scrollY > 0;
        // A sticky offset counts from inside the scroller's padding.
        const edge = scroller ? scroller.getBoundingClientRect().top + (parseFloat(getComputedStyle(scroller).paddingTop) || 0) : 0;
        const pinnedAt = parseFloat(getComputedStyle(el).top) || 0;
        const stuck = scrolled && el.getBoundingClientRect().top - edge <= pinnedAt + 1;
        el.toggleAttribute("data-stuck", stuck);
      });
    };
    check();
    // Capture catches a sheet's own scrolling as well as the page's.
    document.addEventListener("scroll", check, { capture: true, passive: true });
    window.addEventListener("resize", check);
    cleanup.current = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("scroll", check, { capture: true });
      window.removeEventListener("resize", check);
    };
  }, []);
}
