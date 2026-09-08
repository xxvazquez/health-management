"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import type { ManageableItem } from "@/lib/useItemActions";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { ArchiveIcon } from "@/components/ui/icons";

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
          className="rounded-md border px-2 py-1 text-sm leading-5"
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

/** Small trailing icon button — same shape as the note / reminder row
 * actions elsewhere in the app. */
function RowIcon({
  onClick,
  label,
  disabled,
  danger,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40 ${danger ? "notebook-danger" : ""}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

/** Rename (pencil) + Archive + Delete (trash, with an inline Delete/Keep
 * confirm) for one item row — Save/Cancel while renaming. Delete is only
 * offered for an item with no logged history; Archive stays a plain text
 * button since it's the real "remove from Log" action for everything else.
 * Placeable anywhere relative to `ItemNameField` so a row can pin it next
 * to a fixed-width control instead of drifting with the name's length. */
export function ItemActionButtons({
  item,
  busy,
  state,
  onArchiveToggle,
  onDelete,
  iconArchive = false,
}: {
  item: ManageableItem;
  busy: boolean;
  state: InlineRenameState;
  onArchiveToggle: () => void;
  onDelete?: () => void;
  /** Render Archive/Unarchive as an icon button rather than a text button
   * — for tight layouts like the Trends adherence cards. */
  iconArchive?: boolean;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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

  if (confirmingDelete && onDelete) {
    return (
      <span className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
          className="text-xs font-semibold"
          style={{ color: "var(--status-critical)" }}
        >
          Delete
        </button>
        <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Keep
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <RowIcon onClick={state.start} disabled={busy} label="Rename">
        <PencilIcon size={15} />
      </RowIcon>
      {iconArchive ? (
        <RowIcon onClick={onArchiveToggle} disabled={busy} label={item.isArchived ? "Unarchive" : "Archive"}>
          <ArchiveIcon size={15} dir={item.isArchived ? "up" : "down"} />
        </RowIcon>
      ) : (
        <button
          type="button"
          onClick={onArchiveToggle}
          disabled={busy}
          className="rounded-md px-1.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
          style={{ color: "var(--text-muted)" }}
        >
          {item.isArchived ? "Unarchive" : "Archive"}
        </button>
      )}
      {onDelete && (
        <RowIcon onClick={() => setConfirmingDelete(true)} disabled={busy} label="Delete" danger>
          <TrashIcon size={15} />
        </RowIcon>
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
  iconArchive = false,
}: {
  item: ManageableItem;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
  onDelete?: () => void;
  iconArchive?: boolean;
}) {
  const state = useInlineRename(item, onRename);
  return (
    <span className="flex items-center justify-between gap-1.5">
      <span className="min-w-0 truncate">
        <ItemNameField item={item} state={state} />
      </span>
      <span className="flex shrink-0 items-center">
        <ItemActionButtons item={item} busy={busy} state={state} onArchiveToggle={onArchiveToggle} onDelete={onDelete} iconArchive={iconArchive} />
      </span>
    </span>
  );
}
