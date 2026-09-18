"use client";

import { useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";

const LONG_PRESS_MS = 500;

/** A single line of text that may be clipped by `truncate`, with a way to
 * read the full value once it is: a native tooltip on desktop hover (the
 * `title` attribute), and — since touch has no hover — a small popover on
 * a long-press. Same visual pattern as `TabRail`'s icon-only tab tooltip.
 * `className`/`style` style the truncated line itself (size/weight/colour);
 * the wrapper is a shrinking flex child so it truncates inside a flex row. */
export function TruncatedTooltip({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start() {
    timerRef.current = setTimeout(() => setPressed(true), LONG_PRESS_MS);
  }
  function end() {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPressed(false);
  }

  return (
    <span
      className="group relative block min-w-0 flex-1"
      onPointerDown={start}
      onPointerUp={end}
      onPointerLeave={end}
      onPointerCancel={end}
    >
      <span className={clsx("block truncate", className)} style={style} title={text}>
        {text}
      </span>
      <span
        role="tooltip"
        className={clsx(
          "pointer-events-none absolute top-full left-0 z-10 mt-1 max-w-[min(80vw,20rem)] min-h-9 rounded-md px-3 text-sm font-medium whitespace-normal opacity-0 shadow-lg transition-opacity group-hover:opacity-100",
          pressed && "opacity-100",
        )}
        style={{ background: "var(--text-primary)", color: "var(--surface-1)" }}
      >
        {text}
      </span>
    </span>
  );
}
