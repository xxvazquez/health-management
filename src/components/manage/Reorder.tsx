"use client";

import { GripIcon } from "@/components/ui/icons";
import { useDragReorder } from "@/lib/useDragReorder";
import { applyOrder, usePreferences } from "@/lib/usePreferences";

/** A Settings list's drag-to-reorder, saved to the account's preferences
 * under `orderKey` so every screen that shows the list follows it (the
 * data hooks read the same key). `ids` in their current order. */
export function useManageOrder(orderKey: string, ids: readonly string[]) {
  const { prefs, setOrder } = usePreferences();
  const ordered = applyOrder(ids, prefs.orders?.[orderKey], (id) => id);
  return useDragReorder(ordered, (next) => setOrder(orderKey, next));
}

type Drag = ReturnType<typeof useDragReorder>;

/** The ≡ grip at the end of a reorderable row. */
export function ReorderGrip({ drag, id, label }: { drag: Drag; id: string; label: string }) {
  const handle = drag.handleProps(id);
  return (
    <span
      {...handle}
      role="button"
      tabIndex={0}
      aria-label={`Reorder ${label} — drag, or use the arrow keys`}
      className="tap-target flex h-11 w-10 shrink-0 items-center justify-center"
      style={{ ...handle.style, color: "var(--text-muted)" }}
    >
      <GripIcon size={16} />
    </span>
  );
}
