"use client";

import { useRef, type KeyboardEvent } from "react";

/** Roving-tabindex + left/right (plus Home/End) arrow-key movement for a
 * row of same-level tab/segment buttons — only the active one is a tab
 * stop; arrow keys move focus to and select the next/previous item,
 * wrapping at the ends. Shared by `SegmentedTabs`, `Segmented` and
 * `TabRail`, whose buttons otherwise each sat in the page's own Tab order. */
export function useRovingTabs<T extends string>(ids: readonly T[], activeId: T, onSelect: (id: T) => void) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  function registerRef(id: T) {
    return (el: HTMLButtonElement | null) => {
      if (el) refs.current.set(id, el);
      else refs.current.delete(id);
    };
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, currentId: T) {
    let nextIndex: number;
    const idx = ids.indexOf(currentId);
    if (e.key === "ArrowRight") nextIndex = (idx + 1) % ids.length;
    else if (e.key === "ArrowLeft") nextIndex = (idx - 1 + ids.length) % ids.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = ids.length - 1;
    else return;
    e.preventDefault();
    const nextId = ids[nextIndex];
    onSelect(nextId);
    refs.current.get(nextId)?.focus();
  }

  function tabIndex(id: T): 0 | -1 {
    return id === activeId ? 0 : -1;
  }

  return { registerRef, handleKeyDown, tabIndex };
}
