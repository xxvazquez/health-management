"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/ui/icons";
import { useDialogA11y } from "@/components/ui/useDialogA11y";

/**
 * The shared modal: an iOS-style sheet — pinned to the bottom edge with a
 * grab handle on a phone, centred from `sm` up — on the grouped grey ground
 * so `FormGroup` cards read as white rows on it. Render it only while open;
 * it traps focus and closes on Escape or a tap on the backdrop. Rendered in a
 * portal on `document.body`.
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
  const containerRef = useDialogA11y(true, onClose);
  // Portalled to <body> so a sheet opened from inside a <label>, a transformed
  // drawer or a popover isn't clicked through or clipped by its ancestors.
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative flex max-h-[92dvh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
        style={{ background: "var(--page-plane)" }}
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
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--text-secondary)", background: "var(--field-fill)" }}
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
