"use client";

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronIcon, CloseIcon } from "@/components/ui/icons";
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
 *
 * Pass `form` to make it a create/edit form: the panel becomes the `<form>`
 * and the header turns into the iOS form bar — Cancel on the left, the title
 * centred, the submit action on the right — in place of the close button.
 */
export interface SheetForm {
  onSubmit: (e: FormEvent) => void;
  /** "Add" for a new record, "Done" when editing one, "Send" for a message. */
  submitLabel: string;
  submitDisabled?: boolean;
  /** Shows `busyLabel` in place of the label while a save is in flight. */
  busy?: boolean;
  busyLabel?: string;
  /** Tint for Cancel and the submit action — the form's domain colour. */
  accent?: string;
  /** Extra controls left of the submit action, e.g. Delete on an edit form. */
  headerActions?: ReactNode;
}

export function Sheet({
  title,
  subtitle,
  icon,
  titleId,
  onClose,
  form,
  back,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  /** A mark shown before the title (the Lauva logo on the sign-in sheet). */
  icon?: ReactNode;
  /** Id for the title, wired to `aria-labelledby`. */
  titleId: string;
  onClose: () => void;
  form?: SheetForm;
  /** A pushed screen inside the sheet: "‹ label" on the left of a centred title. */
  back?: { label: string; onClick: () => void };
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
  const panelRef = useRef<HTMLDivElement & HTMLFormElement>(null);
  const drag = useRef<{ startY: number; startT: number; dy: number } | null>(null);

  useEffect(() => {
    if (scrollLocks++ === 0) document.body.style.overflow = "hidden";
    return () => {
      if (--scrollLocks === 0) document.body.style.overflow = "";
    };
  }, []);

  const Panel = form ? "form" : "div";

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
      <Panel
        ref={panelRef}
        onSubmit={
          form &&
          ((e: FormEvent) => {
            // A second tap (or Enter) while saving would save twice.
            if (form.busy) e.preventDefault();
            else form.onSubmit(e);
          })
        }
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
          {form ? (
            <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 px-0.5">
              <button type="button" onClick={requestClose} className="hit-slop justify-self-start text-sm" style={{ color: form.accent ?? "var(--ui-accent)" }}>
                Cancel
              </button>
              <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
                <span className="flex max-w-full items-center gap-2">
                  {icon}
                  <h2 id={titleId} className="truncate text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                    {title}
                  </h2>
                </span>
                {subtitle}
              </div>
              <div className="flex items-center justify-self-end gap-3">
                {form.headerActions}
                <button
                  type="submit"
                  disabled={form.submitDisabled || form.busy}
                  className="hit-slop text-sm font-semibold whitespace-nowrap disabled:opacity-40"
                  style={{ color: form.accent ?? "var(--ui-accent)" }}
                >
                  {form.busy ? (form.busyLabel ?? "Saving…") : form.submitLabel}
                </button>
              </div>
            </div>
          ) : back ? (
            <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-3 px-0.5">
              <button type="button" onClick={back.onClick} className="hit-slop -ml-1 flex items-center gap-0.5 justify-self-start text-sm" style={{ color: "var(--ui-accent)" }}>
                <ChevronIcon dir="left" size={16} />
                {back.label}
              </button>
              <h2 id={titleId} className="truncate text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                {title}
              </h2>
              <button
                type="button"
                onClick={requestClose}
                aria-label="Close"
                className="control-surface hit-slop flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-full"
                style={{ color: "var(--text-secondary)" }}
              >
                <CloseIcon />
              </button>
            </div>
          ) : (
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
          )}
        </div>
        {children}
      </Panel>
    </div>,
    document.body,
  );
}
