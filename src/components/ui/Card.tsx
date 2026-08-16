import type { ReactNode } from "react";
import clsx from "clsx";

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={clsx("rounded-2xl border transition-shadow duration-200", padded && "p-5", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-hairline)", boxShadow: "var(--shadow-card)" }}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        {children}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}
