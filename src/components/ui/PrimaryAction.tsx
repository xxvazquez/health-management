import { Button } from "./Button";

/** The one "create something" control — same accent fill and label
 * grammar everywhere it appears. Pass the label as "New <noun>" when it
 * opens a form directly, "Log <noun>" for a past event, or "Add" when it
 * opens a small "what kind?" picker first (Agenda, Health → Visits); the
 * "+" is added here.
 *
 * Renders inline wherever it's called — every call site already places it
 * at the top of its section (a `PageHeading` actions slot, or beside that
 * section's search/sort row), so there's no separate mobile treatment: a
 * fixed floating circle used to sit here instead, but it read as an
 * Android affordance and could cover a scrolled list's last row. */
export function PrimaryAction({
  label,
  onClick,
  accent,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <Button type="button" size="sm" accent={accent} onClick={onClick} disabled={disabled} className="shrink-0 transition-opacity hover:opacity-90">
      + {label}
    </Button>
  );
}
