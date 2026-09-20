import type { ReactNode } from "react";
import clsx from "clsx";
import { LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";

/**
 * One row of an iOS-style form group (see `FormGroup`). Two layouts:
 *
 * - stacked (default): a small label above a borderless control — for text,
 *   notes and anything that needs the full row width.
 * - `inline`: the label on the left, a compact control (select, date,
 *   number, switch) right-aligned on the same line.
 *
 * Wrapping the control in the `<label>` also gives it click-to-focus. For
 * something that isn't one labelled control (two inputs side by side, a chip
 * group), put a plain row inside the `FormGroup` instead.
 */
export function Field({
  label,
  hint,
  inline = false,
  plain = false,
  children,
  className,
}: {
  label: ReactNode;
  /** A muted line below the control. */
  hint?: ReactNode;
  inline?: boolean;
  /** Render a `div` instead of a `<label>` — for a control that has its own
   * clickable parts (a combo box with a dropdown, chip groups). */
  plain?: boolean;
  children: ReactNode;
  className?: string;
}) {
  if (inline) {
    return (
      <label className={clsx("flex min-h-11 items-center justify-between gap-3 px-3.5", className)}>
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        <span className="flex min-w-0 items-center justify-end gap-2">{children}</span>
      </label>
    );
  }
  const Tag = plain ? "div" : "label";
  return (
    <Tag className={clsx("flex flex-col gap-0.5 px-3.5 py-2.5", className)}>
      <span className={LABEL_CLS} style={LABEL_STYLE}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </Tag>
  );
}
