"use client";

import { useEffect, useState } from "react";

/** How far the visible area sits inside the page's layout viewport: `top`
 * is how far it's scrolled down, `bottom` how much is hidden under it (the
 * on-screen keyboard on iOS, which overlays the page instead of resizing
 * it). Both are 0 when nothing is covering the page. */
export function useVisualViewportInsets(): { top: number; bottom: number } {
  const [insets, setInsets] = useState({ top: 0, bottom: 0 });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const top = Math.max(0, Math.round(vv.offsetTop));
      const bottom = Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop));
      setInsets((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }));
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return insets;
}
