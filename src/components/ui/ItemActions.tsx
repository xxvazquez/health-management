"use client";

import { useState, type FormEvent } from "react";
import type { ManageableItem } from "@/lib/useItemActions";

/** Inline rename + archive/unarchive controls for one tracked item —
 * shared by the Habits page and the Manage page so there's one place this
 * row UI lives, backed by the same `useItemActions` hook everywhere. */
export function ItemActions({
  item,
  busy,
  onArchiveToggle,
  onRename,
}: {
  item: ManageableItem;
  busy: boolean;
  onArchiveToggle: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.item);

  if (editing) {
    return (
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setEditing(false);
          onRename(name);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="rounded-md border px-2 py-1 text-sm"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
        />
        <button type="submit" className="text-xs font-medium" style={{ color: "var(--status-good)" }}>
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </form>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {item.item}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
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
    </span>
  );
}
