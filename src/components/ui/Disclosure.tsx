"use client";

import { useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

/**
 * A labelled collapsible section with one affordance app-wide: a chevron
 * that points right when closed and down when open. Use it anywhere a
 * header toggles a block below it — "Done" / "Archived" groups, Manage
 * sections, a dashboard's extra detail.
 *
 * Uncontrolled by default (`defaultOpen`); pass `open` + `onToggle` to
 * drive it from parent state.
 */
export function Disclosure({
  label,
  count,
  meta,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  className,
  labelClassName = "text-xs font-semibold tracking-wide uppercase",
  children,
}: {
  label: ReactNode;
  /** Appended to the label as " (N)". */
  count?: number;
  /** Right-aligned text/element in the trigger row, e.g. "3 set". */
  meta?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
  labelClassName?: string;
  children: ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolled;

  function toggle() {
    const next = !open;
    if (controlledOpen == null) setUncontrolled(next);
    onToggle?.(next);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left"
        style={{ color: "var(--text-muted)" }}
      >
        <ChevronIcon dir={open ? "down" : "right"} size={13} />
        <span className={labelClassName} style={{ color: "var(--text-secondary)" }}>
          {label}
          {count != null && ` (${count})`}
        </span>
        {meta != null && (
          <span className="ml-auto text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            {meta}
          </span>
        )}
      </button>
      {open && children}
    </div>
  );
}
