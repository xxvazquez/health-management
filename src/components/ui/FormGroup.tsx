import { useState, type ReactNode } from "react";
import { InfoButton } from "@/components/ui/InfoButton";
import clsx from "clsx";

/** An iOS inset-grouped form section: rows (`Field`, switch rows) in one
 * white rounded card with hairline separators. `title` is the small
 * uppercase caption above it; `footer` a muted note below; `info` an
 * explanation behind an ⓘ beside the caption. */
export function FormGroup({
  title,
  footer,
  info,
  className,
  children,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  info?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  return (
    <section className={clsx("flex flex-col gap-1.5", className)}>
      {(title || info) && (
        <div className="flex items-center gap-1 px-3.5">
          {title && (
            <h4 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
              {title}
            </h4>
          )}
          {info && <InfoButton open={infoOpen} onToggle={() => setInfoOpen((o) => !o)} size={12} />}
        </div>
      )}
      {info && infoOpen && (
        <p className="px-3.5 text-xs" style={{ color: "var(--text-secondary)" }}>
          {info}
        </p>
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
