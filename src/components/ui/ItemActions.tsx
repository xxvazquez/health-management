"use client";

import { useState, type FormEvent } from "react";
import type { ManageableItem } from "@/lib/useItemActions";

/** Shared rename state backing the two pieces below — lets a row put the
 * name on one side and the Edit/Archive (or Save/Cancel, while renaming)
 * buttons on the other, without duplicating the rename logic. */
export function useInlineRename(item: ManageableItem, onRename: (newName: string) => void) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.item);

  return {
    editing,
    name,
    setName,
    formId: `rename-${item.itemIdentity}`,
    start() {
      setName(item.item);
      setEditing(true);
    },
    cancel() {
      setEditing(false);
    },
    submit(e: FormEvent) {
      e.preventDefault();
      setEditing(false);
      onRename(name);
    },
  };
}

type InlineRenameState = ReturnType<typeof useInlineRename>;

/** Item name, or its rename input when editing. */
export function ItemNameField({ item, state }: { item: ManageableItem; state: InlineRenameState }) {
  if (state.editing) {
    return (
      <form id={state.formId} onSubmit={state.submit}>
        <input
          value={state.name}
          onChange={(e) => state.setName(e.target.value)}
          autoFocus
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
      </form>
    );
  }
  return (
    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
      {item.item}
    </span>
  );
}

/** Edit/Archive buttons (Save/Cancel while renaming) — placeable anywhere
 * relative to `ItemNameField`, so a row can keep them pinned next to
 * whatever fixed-width control sits beside it (a category select, stats)
 * instead of drifting with the item name's length. */
export function ItemActionButtons({
  item,
  busy,
  state,
  onArchiveToggle,
  onDelete,
}: {
  item: ManageableItem;
  busy: boolean;
  state: InlineRenameState;
  onArchiveToggle: () => void;
  /** Only ever passed when the item has no logged history — see
   * `ManageableItem.hasHistory`. Omitted entirely (rather than passed
   * disabled) for an item that can't be deleted, so there's no dead button
   * inviting a click that would just fail. */
  onDelete?: () => void;
}) {
  if (state.editing) {
    return (
      <span className="flex items-center gap-1.5">
        <button type="submit" form={state.formId} className="text-xs font-medium" style={{ color: "var(--status-good)" }}>
          Save
        </button>
        <button type="button" onClick={state.cancel} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={state.start}
        disabled={busy}
        className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        Edit
      </button>
      <button
        type="button"
        onClick={onArchiveToggle}
        disabled={busy}
        className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
        style={{ color: "var(--text-muted)" }}
      >
        {item.isArchived ? "Unarchive" : "Archive"}
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
          style={{ color: "var(--status-critical)" }}
        >
          Delete
        </button>
      )}
    </span>
  );
}

/** Name + Edit/Archive together, inline — for rows with nothing fixed-width
 * to align against (e.g. the Habits page's stat row). */
export function ItemActions({
  item,
  busy,
  onArchiveToggle,
  onRename,
  onDelete,
}: {
  item: ManageableItem;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
  onDelete?: () => void;
}) {
  const state = useInlineRename(item, onRename);
  return (
    <span className="flex flex-wrap items-center gap-2">
      <ItemNameField item={item} state={state} />
      <ItemActionButtons item={item} busy={busy} state={state} onArchiveToggle={onArchiveToggle} onDelete={onDelete} />
    </span>
  );
}
