import { PlusIcon } from "./icons";

/** The one "create something" control: a raised "+" in the section's
 * accent, named by `label` ("New entry", "Add link") for screen readers and
 * the hover tooltip. `round` matches the round menu button in a page title
 * row; without it the button takes the 10px toolbar shape of the search and
 * sort controls beside it. A section with several kinds of thing to add uses
 * `AddMenu`, which opens a pull-down menu from this button. */
export function PrimaryAction({
  label,
  round = false,
  onClick,
  accent,
  disabled = false,
  menuOpen,
}: {
  label: string;
  round?: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
  /** Set by `AddMenu` so the button announces the menu it opens. */
  menuOpen?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-haspopup={menuOpen === undefined ? undefined : "menu"}
      aria-expanded={menuOpen}
      className={`control-surface hit-slop flex h-9 w-9 shrink-0 items-center justify-center transition-opacity active:opacity-60 disabled:opacity-40 ${round ? "rounded-full" : "rounded-[10px]"}`}
      style={{ color: accent }}
    >
      <PlusIcon size={18} />
    </button>
  );
}
