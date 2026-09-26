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
    let index = 0;
    for (const k of others) {
      const rect = rows.current.get(k)?.getBoundingClientRect();
      if (rect && clientY > rect.top + rect.height / 2) index++;
    }
    const next = [...others.slice(0, index), key, ...others.slice(index)];
    if (next.join("\u0000") !== orderRef.current.join("\u0000")) setOrder(next);
  }

  function handleProps(key: string) {
    return {
      onPointerDown: (e: PointerEvent<HTMLElement>) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // No active pointer to capture (e.g. a synthetic event) — moves
          // still arrive while the pointer stays over the grip.
        }
        setDragging(key);
      },
      onPointerMove: (e: PointerEvent<HTMLElement>) => {
        if (dragging === key) moveTo(key, e.clientY);
      },
      onPointerUp: () => {
        if (dragging !== key) return;
        setDragging(null);
        commit(orderRef.current);
      },
      onPointerCancel: () => {
        setDragging(null);
        setOrder([...keys]);
      },
      onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const i = order.indexOf(key);
        const j = e.key === "ArrowUp" ? i - 1 : i + 1;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[i], next[j]] = [next[j], next[i]];
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
