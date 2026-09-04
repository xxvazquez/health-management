"use client";

import { CUSTOM_COLOR_CHOICES, CUSTOM_ICON_KEYS, CustomIcon } from "./customIcons";

/**
 * The icon + colour picker for any user-named grouping (Wishlist
 * categories, reminder lists, lab panels, doctor specialties, …) — one
 * fieldset of icon buttons, one of colour swatches. `null` means "use the
 * default" for both (the app's existing hardcoded fallback for that
 * grouping), so `icon`'s "selected" state treats `null` as the first key.
 */
export function IconColorPicker({
  icon,
  color,
  onIconChange,
  onColorChange,
  accent,
}: {
  icon: string | null;
  color: string | null;
  onIconChange: (icon: string | null) => void;
  onColorChange: (color: string | null) => void;
  accent: string;
}) {
  const defaultIcon = CUSTOM_ICON_KEYS[0];
  return (
    <>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Icon
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOM_ICON_KEYS.map((key) => {
            const selected = (icon ?? defaultIcon) === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                aria-label={key}
                onClick={() => onIconChange(key === defaultIcon ? null : key)}
                className="tap-target flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
                style={{
                  borderColor: selected ? accent : "var(--border-hairline)",
                  background: selected ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "var(--surface-1)",
                  color: selected ? accent : "var(--text-muted)",
                }}
              >
                <CustomIcon icon={key} size={17} />
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          Colour
        </legend>
        <div className="flex flex-wrap gap-2">
          {CUSTOM_COLOR_CHOICES.map((choice) => {
            const selected = color === choice.key;
            return (
              <button
                key={choice.key}
                type="button"
                aria-pressed={selected}
                aria-label={choice.key}
                onClick={() => onColorChange(selected ? null : choice.key)}
                className="tap-target flex h-7 w-7 items-center justify-center rounded-full"
                style={{ boxShadow: selected ? `0 0 0 2px var(--surface-1), 0 0 0 4px ${choice.value}` : "none" }}
              >
                <span className="h-5 w-5 rounded-full" style={{ background: choice.value }} />
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}
