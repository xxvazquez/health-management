"use client";

import { useEffect, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";

/** Gap kept between the caret line and the bottom of whatever is scrolling. */
const CARET_MARGIN = 24;

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === "auto" || overflowY === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/** A <textarea> that grows with its content instead of scrolling, so a long
 * note scrolls with the sheet or page around it rather than inside itself.
 * `rows` is the starting/minimum height; pass `maxRows` only where the field
 * is pinned (a reply bar) and must stop growing. Pair it with `resize-none`. */
export function AutoGrowTextarea({
  value,
  rows = 2,
  maxRows = Infinity,
  ref: outerRef,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number; ref?: Ref<HTMLTextAreaElement> }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastValue = useRef(value);

  function fit() {
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
    // A sub-pixel line height can leave the text nudged up inside a field
    // that shows everything; keep its first line where it belongs.
    if (contentHeight <= maxHeight) el.scrollTop = 0;
    for (const [p, top] of scrolled) if (p.scrollTop !== top) p.scrollTop = top;
    if (window.scrollY !== pageY) window.scrollTo(window.scrollX, pageY);
  }

  useLayoutEffect(() => {
    fit();
    // Typing at the end of a growing field: keep the new line in view above
    // the keyboard instead of letting it slide under it.
    const edited = lastValue.current !== value;
    lastValue.current = value;
    const el = ref.current;
    if (!edited || !el || document.activeElement !== el || el.selectionEnd !== el.value.length || el.style.overflowY === "auto") return;
    const vv = window.visualViewport;
    const parent = scrollParent(el);
    // A scrolling sheet is already sized to the space above the keyboard; on
    // the page itself the keyboard and the phone tab bar cover the bottom.
    let viewBottom = parent ? parent.getBoundingClientRect().bottom : Math.min(window.innerHeight, vv ? vv.offsetTop + vv.height : window.innerHeight);
    const bar = parent ? null : document.querySelector("[data-bottom-bar]")?.getBoundingClientRect();
    if (bar && bar.height > 0) viewBottom = Math.min(viewBottom, bar.top);
    const overflow = el.getBoundingClientRect().bottom + CARET_MARGIN - viewBottom;
    if (overflow <= 0) return;
    if (parent) parent.scrollTop += overflow;
    else window.scrollBy(0, overflow);
    // fit() reads the live value, rows and maxRows; re-run only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, rows, maxRows]);

  // Wrapping changes with the width (a rotation, a sheet settling, the
  // desktop window resizing), so re-fit when it does.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, maxRows]);

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
