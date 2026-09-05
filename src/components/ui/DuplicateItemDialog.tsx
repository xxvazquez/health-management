"use client";

import { useDialogA11y } from "./useDialogA11y";
import { Button } from "./Button";

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
    <div ref={containerRef} className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        className="relative flex w-full max-w-sm flex-col gap-3 rounded-xl border p-5 shadow-xl"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}
      >
        <h2 className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          &quot;{name}&quot; already exists
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {isArchived
            ? "It's archived, so it isn't offered on the Log page — unarchive it instead of adding it again."
            : "It's already in your active list under this name."}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="quiet" size="sm" onClick={onClose}>
            {isArchived ? "Cancel" : "OK"}
          </Button>
          {isArchived && (
            <Button type="button" size="sm" onClick={onUnarchive} disabled={busy}>
              Unarchive
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
