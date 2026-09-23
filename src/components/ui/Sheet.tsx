"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import { useDialogA11y } from "@/components/ui/useDialogA11y";

// Open sheets, so page scrolling is locked until the last one closes.
let scrollLocks = 0;

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.6;

/**
 * The shared modal: an iOS-style sheet — pinned to the bottom edge with a
 * grab handle on a phone (drag the handle or title down to dismiss), centred
 * from `sm` up — on the grouped grey ground so `FormGroup` cards read as
 * white rows on it. Render it only while open; it slides in, locks the page
 * scroll behind it, traps focus and closes on Escape or a tap on the
 * backdrop. Rendered in a portal on `document.body`.
 */
export function Sheet({
  title,
  subtitle,
  icon,
  titleId,
  onClose,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** A mark shown before the title (the Lauva logo on the sign-in sheet). */
  icon?: ReactNode;
  /** Id for the title, wired to `aria-labelledby`. */
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  // Every way out (backdrop, Close, Escape, swipe) plays the exit first.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function requestClose() {
    if (closeTimer.current) return;
    setClosing(true);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = setTimeout(onClose, reduced ? 0 : 200);
  }
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );
  const containerRef = useDialogA11y(true, requestClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  useEffect(() => {
    if (scrollLocks++ === 0) document.body.style.overflow = "hidden";
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = "";
    };
  }, []);

  const phone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches;

  function onDragStart(e: ReactPointerEvent) {
    if (!phone() || (e.target as HTMLElement).closest("button")) return;
    drag.current = { startY: e.clientY, startT: e.timeStamp, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (panelRef.current) panelRef.current.style.transition = "none";
  }

  function onDragMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d || !panelRef.current) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    panelRef.current.style.transform = `translateY(${d.dy}px)`;
  }

  function onDragEnd(e: ReactPointerEvent) {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    const velocity = d.dy / Math.max(1, e.timeStamp - d.startT);
    if (d.dy > DISMISS_DISTANCE || (d.dy > 30 && velocity > DISMISS_VELOCITY)) {
      requestClose();
      return;
    }
    panel.style.transition = "transform 200ms ease-out";
    panel.style.transform = "";
  }

  // Portalled to <body> so a sheet opened from inside a <label>, a transformed
  // drawer or a popover isn't clicked through or clipped by its ancestors.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-end justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="sheet-backdrop absolute inset-0 bg-black/40" data-closing={closing ? "" : undefined} onClick={requestClose} />
      <div
        ref={panelRef}
        data-closing={closing ? "" : undefined}
        className="sheet-panel relative flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto overscroll-contain rounded-[20px] p-4 pb-6 shadow-xl"
        style={{ background: "var(--page-plane)" }}
      >
        <div
          className="-mx-4 -mt-4 flex flex-col gap-4 px-4 pt-4 sm:m-0 sm:p-0"
          style={{ touchAction: "none" }}
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div aria-hidden="true" className="mx-auto -mt-1 h-1 w-9 shrink-0 rounded-full sm:hidden" style={{ background: "var(--baseline)" }} />
          <div className="flex items-start justify-between gap-3 px-0.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2">
                {icon}
                <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                  {title}
                </h2>
              </span>
              {subtitle}
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close"
              className="control-surface hit-slop flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
              style={{ color: "var(--text-secondary)" }}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
