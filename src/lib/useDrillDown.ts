"use client";

import { useEffect, useRef } from "react";

/** Fired on `window` when the tab-bar item you're already on is tapped
 * again. A page showing a drill-down screen cancels it (`preventDefault`)
 * and returns to its top screen, like re-tapping an iOS tab bar item. */
export const NAV_RESELECT_EVENT = "lauva:nav-reselect";

/** Gives an in-page detail screen (one that replaces its list) a history
 * entry, so Back and the phone's edge swipe return to the list instead of
 * leaving the page, and re-tapping `tabHref` in the tab bar closes it too.
 * `close` is the screen's own back action; when the screen closes some
 * other way, the entry it pushed is popped. */
export function useDrillDown(open: boolean, close: () => void, tabHref: string | null = null) {
  const closeRef = useRef(close);
  const pushed = useRef(false);

  useEffect(() => {
    closeRef.current = close;
  });

  useEffect(() => {
    if (open && !pushed.current) {
      window.history.pushState({ ...window.history.state, drillDown: true }, "");
      pushed.current = true;
    } else if (!open && pushed.current) {
      pushed.current = false;
      window.history.back();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      closeRef.current();
    };
    const onReselect = (e: Event) => {
      if (tabHref === null || (e as CustomEvent<string>).detail !== tabHref) return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener(NAV_RESELECT_EVENT, onReselect);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(NAV_RESELECT_EVENT, onReselect);
    };
  }, [open, tabHref]);
}
