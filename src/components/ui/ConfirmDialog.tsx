"use client";

import { useId } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "./useDialogA11y";

/** An iOS-style alert asking to confirm an action, with Cancel beside it.
 * `destructive` colours the action red, for anything that can't be undone.
 * Mount it only while it should show. Portalled to <body> so a row or sheet
 * it is opened from can't clip or offset it; its clicks and touches stop here
 * so they don't reach that row's own handlers. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const containerRef = useDialogA11y(true, onClose);
  const titleId = useId();

  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby={titleId}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="menu-surface relative flex w-full max-w-xs flex-col gap-4 rounded-[20px] p-5">
        <div className="flex flex-col gap-1 text-center">
          <h2 id={titleId} className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
          {message && (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {message}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="control-surface min-h-11 flex-1 rounded-[10px] text-base font-medium active:opacity-70"
            style={{ color: "var(--text-primary)" }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="min-h-11 flex-1 rounded-[10px] text-base font-semibold active:opacity-70 disabled:opacity-50"
            style={{ background: destructive ? "var(--status-critical)" : "var(--ui-accent)", color: "var(--on-accent)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
