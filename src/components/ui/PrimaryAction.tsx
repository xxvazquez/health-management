import { Button } from "./Button";
import { PlusIcon } from "./icons";

/** The one "create something" control — same accent fill and label
 * grammar everywhere it appears. Pass the label as "New <noun>" when it
 * opens a form directly, or "Log <noun>" for a past event; the "+" is added
 * here. A section with several kinds of thing to add uses `AddMenu`, which
 * wraps this in a pull-down menu.
 *
 * Renders inline wherever it's called — every call site already places it
 * at the top of its section (a `PageHeading` actions slot, or beside that
 * section's search/sort row). `compact` turns it into a round "+" button,
 * sized like the menu button beside it, on the narrowest phones where the
 * label would push the page title's row onto two lines. */
export function PrimaryAction({
  label,
  compact = false,
  onClick,
  accent,
  disabled = false,
}: {
  label: string;
  compact?: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      accent={accent}
      onClick={onClick}
      disabled={disabled}
      aria-label={compact ? label : undefined}
      className={`shrink-0 transition-opacity hover:opacity-90 ${compact ? "max-[359px]:w-9 max-[359px]:rounded-full max-[359px]:px-0" : ""}`}
    >
      {compact ? (
        <>
          <span className="min-[360px]:hidden">
            <PlusIcon size={18} />
          </span>
          <span className="hidden min-[360px]:inline">+ {label}</span>
        </>
      ) : (
        `+ ${label}`
      )}
    </Button>
  );
}
