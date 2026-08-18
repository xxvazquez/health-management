import type { ReactNode } from "react";
import clsx from "clsx";

export type CardTier = "primary" | "supporting" | "raw";

const TIER_STYLE: Record<CardTier, { border: string; shadow: string; padding: string; radius: string }> = {
  // The one thing per page that should visually win — generous padding,
  // the only tier with a shadow. Used at most once or twice per page (the
  // Insight component, and Food's ranked priorities list).
  primary: { border: "var(--border-hairline)", shadow: "var(--shadow-card)", padding: "p-5", radius: "rounded-2xl" },
  // Default — a standalone section that's more than a footnote but not
  // the page's primary decision. White surface, light border, no shadow.
  supporting: { border: "var(--border-hairline)", shadow: "none", padding: "p-5", radius: "rounded-2xl" },
  // Deliberately quieter: smaller padding, lighter border, no shadow — for
  // charts/detail sections nested under a "Details" heading that a user
  // opens deliberately rather than scans by default.
  raw: { border: "var(--gridline)", shadow: "none", padding: "p-4", radius: "rounded-xl" },
};

export function Card({
  children,
  className,
  padded = true,
  tier = "supporting",
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  tier?: CardTier;
}) {
  const style = TIER_STYLE[tier];
  return (
    <div
      className={clsx("rounded-2xl border transition-shadow duration-200", style.radius, padded && style.padding, className)}
      style={{ background: "var(--surface-1)", borderColor: style.border, boxShadow: style.shadow }}
    >
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  subtitle,
  size = "default",
}: {
  children: ReactNode;
  subtitle?: ReactNode;
  size?: "default" | "sm";
}) {
  return (
    <div className="mb-4">
      <h3
        className={size === "sm" ? "text-sm font-medium" : "text-base font-semibold"}
        style={{ color: size === "sm" ? "var(--text-secondary)" : "var(--text-primary)" }}
      >
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
