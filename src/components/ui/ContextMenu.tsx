"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { MenuItemList, type MoreMenuItem } from "@/components/ui/MoreMenu";

const LONG_PRESS_MS = 500;
/** A finger that moves this far is scrolling or swiping, not pressing. */
const MOVE_TOLERANCE_PX = 10;
const MENU_WIDTH = 224;
const ROW_HEIGHT = 40;
const EDGE = 8;
/** After a long-press opens the menu, the finger's own lift can still send
 * a click; ignore clicks this soon so it neither closes nor picks. */
const GHOST_CLICK_MS = 400;

export interface ContextMenuBind {
  onTouchStart: (e: TouchEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
}

/**
 * iOS's context menu for a row: a long-press on a phone (with a haptic on
 * Android) or a right-click on desktop opens the actions for what's under
 * the finger, at that spot. Spread `bind` on the row and render `menu`
 * outside it; `open` is for a pressed-row tint. The tap that ends a
 * long-press never also opens the row.
 */
export function useContextMenu(items: MoreMenuItem[]): { bind: ContextMenuBind; menu: ReactNode; open: boolean } {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const timer = useRef<number | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallowClick = useRef(false);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const openedByTouchAt = useRef(0);
  const isGhostClick = () => Date.now() - openedByTouchAt.current < GHOST_CLICK_MS;

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => cancel, []);

  useEffect(() => {
    if (!at) return;
    firstItemRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAt(null);
    };
    const close = () => setAt(null);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [at]);

  const show = (x: number, y: number) => {
    if (items.length === 0) return;
    setAt({ x, y });
  };

  const bind: ContextMenuBind = {
    onTouchStart: (e) => {
      cancel();
      swallowClick.current = false;
      const t = e.touches[0];
      start.current = { x: t.clientX, y: t.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        swallowClick.current = true;
        navigator.vibrate?.(10);
        openedByTouchAt.current = Date.now();
        if (start.current) show(start.current.x, start.current.y);
      }, LONG_PRESS_MS);
    },
    onTouchMove: (e) => {
      const t = e.touches[0];
      const s = start.current;
      if (s && Math.hypot(t.clientX - s.x, t.clientY - s.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onTouchEnd: () => {
      cancel();
      // Some browsers send no click after a long-press; don't eat a later tap.
      if (swallowClick.current) window.setTimeout(() => (swallowClick.current = false), 400);
    },
    onTouchCancel: cancel,
    onContextMenu: (e) => {
      if (items.length === 0) return;
      e.preventDefault();
      cancel();
      // Android fires this on a long-press too, before the timer does.
      if (at) return;
      show(e.clientX, e.clientY);
    },
    onClickCapture: (e) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };

  let menu: ReactNode = null;
  if (at && typeof document !== "undefined") {
    const separators = items.filter((it, i) => it.separated && i > 0).length;
    const height = items.length * ROW_HEIGHT + separators * 9 + 12;
    const left = Math.max(EDGE, Math.min(at.x, window.innerWidth - MENU_WIDTH - EDGE));
    const top = at.y + height + EDGE > window.innerHeight ? Math.max(EDGE, at.y - height) : at.y;
    menu = createPortal(
      <>
        <div
          className="fixed inset-0 z-[60] bg-black/20"
          aria-hidden="true"
          onClick={() => {
            if (!isGhostClick()) setAt(null);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setAt(null);
          }}
        />
        <div
          role="menu"
          className="menu-surface fixed z-[60] p-1.5"
          style={{ left, top, width: MENU_WIDTH }}
          onClickCapture={(e) => {
            if (!isGhostClick()) return;
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <MenuItemList
            items={items}
            firstItemRef={firstItemRef}
            onPick={() => {
              swallowClick.current = false;
              setAt(null);
            }}
          />
        </div>
      </>,
      document.body,
    );
  }

  return { bind, menu, open: at !== null };
}

/** `useContextMenu` for a row rendered inside a list's `map`. */
export function ContextMenu({ items, children }: { items: MoreMenuItem[]; children: (bind: ContextMenuBind, open: boolean) => ReactNode }) {
  const { bind, menu, open } = useContextMenu(items);
  return (
    <>
      {children(bind, open)}
      {menu}
    </>
  );
}

/** The faint tint on the row a context menu belongs to while it's open. */
export const CONTEXT_OPEN_STYLE = { background: "var(--page-plane)" } as const;
