"use client";

import { useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";

/** A <textarea> that grows with its content instead of scrolling. `rows`
 * is the starting/minimum height; once the text passes `maxRows` it stops
 * growing and scrolls. Pair it with `resize-none` — the two don't mix. */
export function AutoGrowTextarea({
  value,
  rows = 2,
  maxRows = 10,
  ref: outerRef,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number; ref?: Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lineHeight = parseFloat(cs.lineHeight) || 20;
    const frame =
      parseFloat(cs.paddingTop) +
      parseFloat(cs.paddingBottom) +
      parseFloat(cs.borderTopWidth) +
      parseFloat(cs.borderBottomWidth);
    const minHeight = lineHeight * rows + frame;
    const maxHeight = lineHeight * maxRows + frame;
    // Collapsing to "auto" to measure briefly shortens the page, which
    // clamps any scroll position near the bottom — put it back afterwards
    // so the page doesn't jump while typing.
    const scrolled: [Element, number][] = [];
    for (let p = el.parentElement; p; p = p.parentElement) if (p.scrollTop > 0) scrolled.push([p, p.scrollTop]);
    const pageY = window.scrollY;
    el.style.height = "auto";
    // scrollHeight includes padding but not border
    const contentHeight = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
    el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
    for (const [p, top] of scrolled) if (p.scrollTop !== top) p.scrollTop = top;
    if (window.scrollY !== pageY) window.scrollTo(window.scrollX, pageY);
  }, [value, rows, maxRows]);

  return (
    <textarea
      ref={(el) => {
        ref.current = el;
        if (typeof outerRef === "function") outerRef(el);
        else if (outerRef) outerRef.current = el;
      }}
      rows={rows}
      value={value}
      {...props}
    />
  );
}
