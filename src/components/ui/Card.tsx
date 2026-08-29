import type { ReactNode } from "react";
import clsx from "clsx";

export type CardTier = "primary" | "supporting" | "raw";

const TIER_STYLE: Record<CardTier, { bg: string; border: string; shadow: string; padding: string; radius: string }> = {
  // The one thing per page that should visually win — a soft mint wash,
  // a real shadow, the largest radius. Used at most once or twice per page
  // (the Insight component, Overview's Today, Food's ranked priorities).
  primary: {
    bg: "color-mix(in oklab, var(--brand-mint) 40%, var(--surface-1))",
    border: "color-mix(in oklab, var(--brand-leaf) 18%, var(--border-hairline))",
    shadow: "var(--shadow-card)",
    padding: "p-5",
    radius: "rounded-2xl",
  },
  // Default — a standalone section that's more than a footnote but not
  // the page's primary decision. Plain white, light border, no shadow.
  supporting: { bg: "var(--surface-1)", border: "var(--border-hairline)", shadow: "none", padding: "p-5", radius: "rounded-xl" },
  // Deliberately quiet: a hair off pure white so a raw card nested inside
  // a white supporting card still has an edge, and a standalone one on the
  // page backdrop still reads as a surface. Smaller padding, no shadow —
  // for charts/detail sections opened deliberately rather than scanned.
  raw: {
    bg: "color-mix(in oklab, var(--page-backdrop) 55%, var(--surface-1))",
    border: "var(--gridline)",
    shadow: "none",
    padding: "p-4",
    radius: "rounded-lg",
  },
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
      className={clsx("border transition-shadow duration-200", style.radius, padded && style.padding, className)}
      style={{ background: style.bg, borderColor: style.border, boxShadow: style.shadow }}
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
    <div className="mb-3">
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
