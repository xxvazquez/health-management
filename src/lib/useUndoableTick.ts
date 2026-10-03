"use client";

import { useEffect, useRef, useState } from "react";

/** Like Reminders: a ticked row fills in and stays for a moment before
 * `onComplete` runs (and the row leaves its list); a second tap in that
 * time takes the tick back. Leaving the screen mid-wait still completes it. */
export function useUndoableTick(onComplete: () => void, delayMs = 1500) {
  const [ticked, setTicked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  });
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        completeRef.current();
      }
    },
    [],
  );

  function toggle() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      setTicked(false);
      return;
    }
    setTicked(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      completeRef.current();
    }, delayMs);
  }

  return { ticked, toggle };
}
