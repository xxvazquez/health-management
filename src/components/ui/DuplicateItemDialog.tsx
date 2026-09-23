"use client";

import { useDialogA11y } from "./useDialogA11y";

/** Shown instead of silently creating a duplicate when adding an item
 * matches an existing one's name (case/whitespace-insensitive) — an active
 * match just can't be re-added under the same name, an archived one offers
 * a one-click way to bring it back instead of typing it fresh. Shared by
 * the Manage page and the Log page's "add new item" flow, the two places
 * that create items. */
export function DuplicateItemDialog({
  name,
  isArchived,
  busy,
  onUnarchive,
  onClose,
}: {
  name: string;
  isArchived: boolean;
  busy: boolean;
  onUnarchive: () => void;
  onClose: () => void;
}) {
  // Always active while mounted — the parent conditionally renders this
  // component at all, rather than passing it its own `open` prop.
  const containerRef = useDialogA11y(true, onClose);

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-6" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-item-title">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="menu-surface relative flex w-full max-w-xs flex-col gap-4 rounded-[20px] p-5">
        <div className="flex flex-col gap-1 text-center">
          <h2 id="duplicate-item-title" className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            &quot;{name}&quot; already exists
          </h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {isArchived
              ? "It's archived, so it isn't offered on the Log page — unarchive it instead of adding it again."
              : "It's already in your active list under this name."}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`min-h-11 flex-1 rounded-[10px] text-base active:opacity-70 ${isArchived ? "control-surface font-medium" : "font-semibold"}`}
            style={isArchived ? { color: "var(--text-primary)" } : { background: "var(--ui-accent)", color: "var(--on-accent)" }}
          >
            {isArchived ? "Cancel" : "OK"}
          </button>
          {isArchived && (
            <button
              type="button"
              onClick={onUnarchive}
              disabled={busy}
              className="min-h-11 flex-1 rounded-[10px] text-base font-semibold active:opacity-70 disabled:opacity-50"
              style={{ background: "var(--ui-accent)", color: "var(--on-accent)" }}
            >
              Unarchive
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
