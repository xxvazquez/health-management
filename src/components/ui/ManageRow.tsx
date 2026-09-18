"use client";

import { useState, type FormEvent } from "react";
import { CustomIcon } from "@/components/ui/customIcons";
import { ChevronIcon } from "@/components/ui/icons";
import { IconColorPicker } from "@/components/ui/IconColorPicker";

/** A row's custom icon/colour, and how to change it — passed only by a
 * grouping that has `icon`/`color` columns to persist to. Shown as a tile on
 * the row and an Icon & colour row (with the shared picker) when it's open. */
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

/** One row in a Settings list — a tappable line (icon tile, name, chevron)
 * that opens its fields below: a Name row, an optional Icon & colour row, an
 * optional Show/Hide toggle, and a delete with an inline Delete/Keep
 * confirm. Owns its own open + confirm state; the parent just supplies the
 * handlers. Sits inside a `.inset-rows` group. Used by the Reminder-lists and
 * Doctor-types sections; the tracked-item rows have their own richer row
 * (extra per-item controls) in the Settings page. */
export function ManageRow({
  name,
  isArchived = false,
  busy = false,
  maxLength = 60,
  appearance,
  swatch,
  onRename,
  onDelete,
  onToggleHide,
}: {
  name: string;
  isArchived?: boolean;
  busy?: boolean;
  maxLength?: number;
  appearance?: ManageRowAppearance;
  /** A single colour for the row (Stool colours) — a dot on the row and a
   * Colour field when open. */
  swatch?: { value: string; onChange: (value: string) => void };
  onRename: (next: string) => void;
  onDelete: () => void;
  onToggleHide?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pickingAppearance, setPickingAppearance] = useState(false);

  function save(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    if (next && next !== name) onRename(next);
  }

  const changed = draft.trim() !== "" && draft.trim() !== name;

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          setConfirmingDelete(false);
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left"
      >
        {appearance && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ color: appearance.accent, background: `color-mix(in oklab, ${appearance.accent} 14%, transparent)` }}
          >
            <CustomIcon icon={appearance.icon} size={15} />
          </span>
        )}
        {swatch && <span className="h-5 w-5 shrink-0 rounded-full border" style={{ background: swatch.value, borderColor: "var(--border-hairline)" }} />}
        <span className="min-w-0 flex-1 truncate text-sm" style={{ color: isArchived ? "var(--text-muted)" : "var(--text-primary)" }}>
          {name}
        </span>
        {isArchived && (
          <span className="shrink-0 text-sm" style={{ color: "var(--text-muted)" }}>
            Hidden
          </span>
        )}
        <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
          <ChevronIcon dir={open ? "down" : "right"} size={14} />
        </span>
      </button>

      {open && (
        <div className="inset-rows border-t" style={{ borderColor: "var(--gridline)", background: "color-mix(in oklab, var(--page-plane) 55%, var(--surface-1))" }}>
          <form onSubmit={save} className="flex min-h-11 items-center gap-3 px-3.5">
            <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
              Name
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={maxLength}
              aria-label={`Rename ${name}`}
              className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none"
              style={{ color: "var(--text-secondary)" }}
            />
            {changed && (
              <button type="submit" disabled={busy} className="shrink-0 py-2 text-sm font-semibold disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                Save
              </button>
            )}
          </form>

          {swatch && (
            <label className="flex min-h-11 items-center gap-3 px-3.5">
              <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                Colour
              </span>
              <input
                type="color"
                value={swatch.value}
                onChange={(e) => swatch.onChange(e.target.value)}
                disabled={busy}
                aria-label={`${name} colour`}
                className="h-7 w-10 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
              />
            </label>
          )}

          {appearance && (
            <div>
              <button
                type="button"
                onClick={() => setPickingAppearance((v) => !v)}
                aria-expanded={pickingAppearance}
                className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left"
              >
                <span className="flex-1 text-sm" style={{ color: "var(--text-primary)" }}>
                  Icon &amp; colour
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  <ChevronIcon dir={pickingAppearance ? "down" : "right"} size={14} />
                </span>
              </button>
              {pickingAppearance && (
                <div className="px-3.5 pb-3">
                  <IconColorPicker
                    icon={appearance.icon}
                    color={appearance.color}
                    onIconChange={appearance.onIconChange}
                    onColorChange={appearance.onColorChange}
                    accent={appearance.accent}
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
            {onToggleHide ? (
              <button type="button" onClick={onToggleHide} disabled={busy} className="min-h-11 text-sm disabled:opacity-40" style={{ color: "var(--ui-accent)" }}>
                {isArchived ? "Show" : "Hide"}
              </button>
            ) : (
              <span />
            )}
            {confirmingDelete ? (
              <span className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(false);
                    onDelete();
                  }}
                  className="min-h-11 text-sm font-semibold"
                  style={{ color: "var(--status-critical)" }}
                >
                  Delete for good
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className="min-h-11 text-sm disabled:opacity-40" style={{ color: "var(--status-critical)" }}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
