"use client";

import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { useData } from "@/lib/DataContext";

/** Vertical drag past this many px (already resistance-damped) triggers a
 * refresh on release. */
const THRESHOLD = 64;
/** Damping so the indicator/content can't be dragged further than this,
 * however far the finger actually travels. */
const MAX_PULL = 88;

/**
 * A native-style pull-to-refresh: dragging down from the very top of the
 * page reveals a refresh glyph and, past `THRESHOLD`, re-syncs with
 * Supabase on release. Wraps the page content (not the fixed bottom nav)
 * so only the actual page shifts, matching the gesture every native list
 * view has — the browser's own overscroll bounce is disabled app-wide
 * (see globals.css) specifically to make room for this instead.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const { syncNow, refresh, isDemoData } = useData();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const startY = useRef<number | null>(null);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (refreshing || window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      setDragging(true);
    },
    [refreshing],
  );

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) {
      setPull(0);
      return;
    }
    // Resistance curve — the indicator trails well behind the finger so it
    // reads as a drag against something, not a 1:1 follow.
    setPull(Math.min(MAX_PULL, delta * 0.45));
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (startY.current === null) return;
    startY.current = null;
    setDragging(false);
    if (pull < THRESHOLD) {
      setPull(0);
      return;
    }
    setRefreshing(true);
    const action = isDemoData ? refresh : syncNow;
    void action().finally(() => {
      setRefreshing(false);
      setPull(0);
    });
  }, [pull, isDemoData, refresh, syncNow]);

  const indicatorProgress = Math.min(1, pull / THRESHOLD);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ position: "relative" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 flex justify-center"
        style={{ top: -36, height: 32, opacity: refreshing ? 1 : indicatorProgress }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 20 20"
          fill="none"
          stroke="var(--ui-accent)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={refreshing ? "animate-spin" : undefined}
          style={refreshing ? undefined : { transform: `rotate(${indicatorProgress * 300}deg)` }}
        >
          <path d="M16.5 5.5a7 7 0 1 0 1.2 5" />
          <path d="M17 3v4h-4" />
        </svg>
      </div>
      <div
        style={{
          transform: `translateY(${refreshing ? THRESHOLD * 0.6 : pull}px)`,
          transition: dragging ? "none" : "transform 0.25s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
