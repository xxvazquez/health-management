"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/** Drag-to-reorder for a short vertical list, by a grip handle — touch,
 * mouse, or the arrow keys once the grip has focus. The list reorders live
 * while dragging; `onCommit` gets the final order once, on release, and
 * only if it changed. Rows register their element with `rowRef` so the drop
 * position can be measured. */
export function useDragReorder(keys: readonly string[], onCommit: (next: string[]) => void) {
  const [order, setOrderState] = useState<string[]>([...keys]);
  const [dragging, setDragging] = useState<string | null>(null);
  const rows = useRef(new Map<string, HTMLElement>());
  // Pointer moves arrive faster than re-renders; the ref holds the latest.
  const orderRef = useRef(order);
  function setOrder(next: string[]) {
    orderRef.current = next;
    setOrderState(next);
  }

  // Follow the list from outside while nothing is being dragged.
  const keysSignature = keys.join("\u0000");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the prop list between drags
    if (!dragging) setOrder([...keys]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSignature]);

  function commit(next: string[]) {
    if (next.join("\u0000") !== keysSignature) onCommit(next);
  }

  function moveTo(key: string, clientY: number) {
    const others = orderRef.current.filter((k) => k !== key);
    // Land just after the last row on screen that the pointer has passed.
    // Keys with no row (a list can hide some, like empty categories) can't
    // be measured, so they keep their place relative to the visible ones
    // instead of throwing the count off.
    let index = 0;
    others.forEach((k, i) => {
      const rect = rows.current.get(k)?.getBoundingClientRect();
      if (rect && clientY > rect.top + rect.height / 2) index = i + 1;
    });
    const next = [...others.slice(0, index), key, ...others.slice(index)];
    if (next.join("\u0000") !== orderRef.current.join("\u0000")) setOrder(next);
  }

  // While a row is held, follow the pointer on the whole window rather than
  // on the grip: reordering moves the grip's element in the page, and a
  // browser can drop pointer capture when that happens, which left a drag
  // stuck after a single step.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: globalThis.PointerEvent) => moveTo(dragging, e.clientY);
    const up = () => {
      setDragging(null);
      commit(orderRef.current);
    };
    const cancel = () => {
      setDragging(null);
      setOrder([...keys]);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebinds per drag, not per render
  }, [dragging]);

  function handleProps(key: string) {
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        setDragging(key);
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        // Step past neighbours that aren't on screen, so one press moves one visible row.
        const i = order.indexOf(key);
        const dir = e.key === "ArrowUp" ? -1 : 1;
        let j = i + dir;
        while (j >= 0 && j < order.length && !rows.current.has(order[j])) j += dir;
        if (j < 0 || j >= order.length) return;
        const next = order.filter((k) => k !== key);
        next.splice(next.indexOf(order[j]) + (dir > 0 ? 1 : 0), 0, key);
        setOrder(next);
        commit(next);
      },
      style: { touchAction: "none" as const, cursor: dragging === key ? "grabbing" : "grab" },
    };
  }

  function rowRef(key: string) {
    return (el: HTMLElement | null) => {
      if (el) rows.current.set(key, el);
      else rows.current.delete(key);
    };
  }

  return { order, dragging, handleProps, rowRef };
}
