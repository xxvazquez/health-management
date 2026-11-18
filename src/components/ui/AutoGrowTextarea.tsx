"use client";

import { useEffect, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from "react";

/** Gap kept between the caret line and the bottom of whatever is scrolling. */
const CARET_MARGIN = 24;

/** Styles that decide how text wraps and how tall it ends up. */
const MEASURED_STYLES = [
  "box-sizing",
  "width",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "border-top-width",
  "border-right-width",
  "border-bottom-width",
  "border-left-width",
  "border-style",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-variant",
  "font-stretch",
  "letter-spacing",
  "word-spacing",
  "line-height",
  "text-indent",
  "text-transform",
  "text-wrap",
  "white-space",
  "word-break",
  "overflow-wrap",
  "tab-size",
];

let measurer: HTMLTextAreaElement | null = null;

/** Height of `el`'s text at its current width, measured on an off-screen
 * copy so the field itself never collapses while typing — collapsing it
 * shortens the page for a moment, and iOS answers that by scrolling. */
function contentHeight(el: HTMLTextAreaElement, cs: CSSStyleDeclaration): number {
  if (!measurer) {
    measurer = document.createElement("textarea");
    measurer.setAttribute("aria-hidden", "true");
    measurer.tabIndex = -1;
    measurer.readOnly = true;
    document.body.appendChild(measurer);
  }
  let css = "position:absolute;top:0;left:-9999px;visibility:hidden;pointer-events:none;overflow:hidden;height:0;min-height:0;max-height:none;";
  for (const prop of MEASURED_STYLES) css += `${prop}:${cs.getPropertyValue(prop)};`;
  measurer.style.cssText = css;
  measurer.value = el.value;
  // scrollHeight includes padding but not border
  return measurer.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
}

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
    const needed = Math.ceil(contentHeight(el, cs));
    const height = `${Math.max(minHeight, Math.min(needed, maxHeight))}px`;
    const overflowY = needed > maxHeight ? "auto" : "hidden";
    if (el.style.height !== height) el.style.height = height;
    if (el.style.overflowY !== overflowY) el.style.overflowY = overflowY;
    // A sub-pixel line height can leave the text nudged up inside a field
    // that shows everything; keep its first line where it belongs.
    if (overflowY === "hidden" && el.scrollTop !== 0) el.scrollTop = 0;
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
