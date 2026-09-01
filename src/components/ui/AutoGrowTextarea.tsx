"use client";

import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

/** A <textarea> that grows with its content instead of scrolling. `rows`
 * is the starting/minimum height; once the text passes `maxRows` it stops
 * growing and scrolls. Pair it with `resize-none` — the two don't mix. */
export function AutoGrowTextarea({
  value,
  rows = 2,
  maxRows = 10,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }) {
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
    el.style.height = "auto";
    // scrollHeight includes padding but not border
    const contentHeight = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${Math.max(minHeight, Math.min(contentHeight, maxHeight))}px`;
    el.style.overflowY = contentHeight > maxHeight ? "auto" : "hidden";
  }, [value, rows, maxRows]);

  return <textarea ref={ref} rows={rows} value={value} {...props} />;
}
