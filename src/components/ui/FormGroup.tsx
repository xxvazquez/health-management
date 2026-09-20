import type { ReactNode } from "react";
import clsx from "clsx";

/** An iOS inset-grouped form section: rows (`Field`, switch rows) in one
 * white rounded card with hairline separators. `title` is the small
 * uppercase caption above it; `footer` a muted note below. */
export function FormGroup({
  title,
  footer,
  className,
  children,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={clsx("flex flex-col gap-1.5", className)}>
      {title && (
        <h4 className="px-3.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          {title}
        </h4>
      )}
      <div className="inset-rows rounded-xl border [--row-inset:0.875rem]" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {children}
      </div>
      {footer && (
        <p className="px-3.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {footer}
        </p>
      )}
    </section>
  );
}
