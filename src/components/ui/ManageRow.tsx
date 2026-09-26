"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { CustomIcon } from "@/components/ui/customIcons";
import { ChevronIcon } from "@/components/ui/icons";
import { IconColorPicker } from "@/components/ui/IconColorPicker";
import { FormGroup } from "@/components/ui/FormGroup";
import { Sheet } from "@/components/ui/Sheet";

/** A row's custom icon/colour, and how to change it — passed only by a
 * grouping that has `icon`/`color` columns to persist to. Shown as a tile on
 * the row and as the picker in its sheet. */
export interface ManageRowAppearance {
  icon: string | null;
  color: string | null;
  /** Effective accent for this row right now (its own colour, or the
   * grouping's existing fallback) — used to tint the glyph tile and
   * highlight the picker's current selection. */
  accent: string;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
  /** Built-in glyph shown while no icon is set (a category's default). */
  defaultIcon?: string;
}

const ROW = "flex min-h-11 w-full items-center gap-3 px-3.5 text-left text-sm disabled:opacity-40";

/** One row in a Settings list — icon tile or colour dot, name, chevron —
 * that opens its editor in a `Sheet`, the same as a tracked item: Name, an
 * optional colour or icon & colour, then Hide/Show and Delete (confirmed in
 * place). A typed name saves on Enter, on leaving the field, or on closing
 * the sheet. Sits inside a `.inset-rows` group. */
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
   * Colour field in the sheet. */
  swatch?: { value: string; onChange: (value: string) => void };
  /** Omit where a name can't be changed — the Name row is then read-only. */
  onRename?: (next: string) => void;
  onDelete: () => void;
  onToggleHide?: () => void;
}) {
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const committed = useRef(name);

  function commitName() {
    const next = draft.trim();
    if (!onRename || !next || next === name || next === committed.current) return;
    committed.current = next;
    onRename(next);
  }

  function save(e: FormEvent) {
    e.preventDefault();
    commitName();
  }

  function close() {
    commitName();
    setOpen(false);
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          setDraft(name);
          committed.current = name;
          setConfirmingDelete(false);
          setOpen(true);
        }}
        aria-haspopup="dialog"
        className="flex min-h-11 w-full items-center gap-3 px-3.5 text-left"
      >
        {appearance && (
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
            style={{ color: appearance.accent, background: `color-mix(in oklab, ${appearance.accent} 14%, transparent)` }}
          >
            <CustomIcon icon={appearance.icon ?? appearance.defaultIcon ?? null} size={15} />
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
          <ChevronIcon dir="right" size={14} />
        </span>
      </button>

      {open && (
        <Sheet title={name} titleId={titleId} onClose={close}>
          <div className="flex flex-col gap-4">
            <FormGroup>
              <form onSubmit={save} className="flex min-h-11 items-center gap-3 px-3.5">
                <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
                  Name
                </span>
                {onRename ? (
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitName}
                    maxLength={maxLength}
                    aria-label={`Rename ${name}`}
                    className="min-w-0 flex-1 bg-transparent py-2 text-right text-sm outline-none"
                    style={{ color: "var(--text-secondary)" }}
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-right text-sm" style={{ color: "var(--text-secondary)" }}>
                    {name}
                  </span>
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
            </FormGroup>

            {appearance && (
              <FormGroup title="Icon & colour">
                <div className="px-3.5 py-3">
                  <IconColorPicker
                    icon={appearance.icon}
                    color={appearance.color}
                    onIconChange={appearance.onIconChange}
                    onColorChange={appearance.onColorChange}
                    accent={appearance.accent}
                    defaultIcon={appearance.defaultIcon}
                  />
                </div>
              </FormGroup>
            )}

            <FormGroup>
              {onToggleHide && (
                <button
                  type="button"
                  onClick={() => {
                    onToggleHide();
                    close();
                  }}
                  disabled={busy}
                  className={ROW}
                  style={{ color: "var(--ui-accent)" }}
                >
                  {isArchived ? "Show" : "Hide"}
                </button>
              )}
              {confirmingDelete ? (
                <div className="flex min-h-11 items-center justify-between gap-4 px-3.5">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
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
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmingDelete(true)} disabled={busy} className={ROW} style={{ color: "var(--status-critical)" }}>
                  Delete
                </button>
              )}
            </FormGroup>
          </div>
        </Sheet>
      )}
    </li>
  );
}
