"use client";

import { useState } from "react";
import { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { CustomIcon } from "@/components/ui/customIcons";
import { IconColorPicker } from "@/components/ui/IconColorPicker";

/** A row's custom icon/colour, and how to change it — passed only by a
 * grouping that has `icon`/`color` columns to persist to. Renders a glyph
 * button that expands the shared picker in place. */
export interface ManageRowAppearance {
  icon: string | null;
  color: string | null;
  /** Effective accent for this row right now (its own colour, or the
   * grouping's existing fallback) — used to tint the glyph button and
   * highlight the picker's current selection. */
  accent: string;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
}

/** One row in a Manage-page list — a name with inline rename, an optional
 * Show/Hide toggle, an optional icon/colour picker, and a delete with an
 * inline Delete/Keep confirm. Owns its own edit + confirm state; the
 * parent just supplies the handlers. Used by the Reminder-lists and
 * Doctor-types sections; the item rows have their own richer row (extra
 * per-item controls) built on ItemActions. */
export function ManageRow({
  name,
  isArchived = false,
  busy = false,
  maxLength = 60,
  appearance,
  onRename,
  onDelete,
  onToggleHide,
}: {
  name: string;
  isArchived?: boolean;
  busy?: boolean;
  maxLength?: number;
  appearance?: ManageRowAppearance;
  onRename: (next: string) => void;
  onDelete: () => void;
  onToggleHide?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingAppearance, setEditingAppearance] = useState(false);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== name) onRename(next);
  }

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        {appearance && (
          <button
            type="button"
            onClick={() => setEditingAppearance((v) => !v)}
            aria-label={`Change ${name}'s icon and colour`}
            aria-pressed={editingAppearance}
            className="tap-target flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--page-plane)]"
            style={{ color: appearance.accent }}
          >
            <CustomIcon icon={appearance.icon} size={16} />
          </button>
        )}
        {editing ? (
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onFocus={(e) => e.target.select()}
              onBlur={commit}
              maxLength={maxLength}
              // pill-field opts this out of the mobile 16px-font rule
              // (globals.css) — same as the item rows, confirmed on-device not
              // to trigger iOS's zoom-on-focus.
              className="pill-field flex-1 rounded-md border px-2 py-1 text-sm leading-5"
              style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
            />
          </form>
        ) : (
          <span className="flex-1 truncate text-sm font-medium" style={{ color: isArchived ? "var(--text-muted)" : "var(--text-primary)" }}>
            {name}
          </span>
        )}

        {confirmingDelete ? (
          <span className="flex shrink-0 items-center gap-1.5">
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
        ) : (
          !editing && (
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setDraft(name);
                  setEditing(true);
                }}
                disabled={busy}
                aria-label={`Rename ${name}`}
                title="Rename"
                className="tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                <PencilIcon size={15} />
              </button>
              {onToggleHide && (
                <button
                  type="button"
                  onClick={onToggleHide}
                  disabled={busy}
                  className="rounded-md px-1.5 py-1 text-xs font-medium transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
                  style={{ color: "var(--text-muted)" }}
                >
                  {isArchived ? "Show" : "Hide"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={busy}
                aria-label={`Delete ${name}`}
                title="Delete"
                className="notebook-danger tap-target rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                <TrashIcon size={15} />
              </button>
            </span>
          )
        )}
      </div>

      {appearance && editingAppearance && (
        <div className="flex flex-col gap-1.5 pl-9">
          <IconColorPicker
            icon={appearance.icon}
            color={appearance.color}
            onIconChange={appearance.onIconChange}
            onColorChange={appearance.onColorChange}
            accent={appearance.accent}
          />
        </div>
      )}
    </li>
  );
}
