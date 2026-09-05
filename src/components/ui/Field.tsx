import type { ReactNode } from "react";
import clsx from "clsx";
import { LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";

/**
 * Label + control wrapper — the `flex flex-col gap-1.5` / `LABEL_CLS` span
 * markup that every Lauva form hand-rolls per field. Wrapping the control
 * in the `<label>` also gives it click-to-focus. Same rendered look as the
 * common existing pattern, so adopting it is visually a no-op.
 *
 * For a field that isn't a single labelled control (a row of two inputs, a
 * checkbox), don't use this — lay it out directly.
 */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  /** A muted line below the control. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1.5", className)}>
      <span className={LABEL_CLS} style={LABEL_STYLE}>
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}
