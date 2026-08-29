import type { ReactNode } from "react";
import clsx from "clsx";

export type CardTier = "primary" | "supporting" | "raw";

// Two elevations, plus the hero wash. `primary` is the one thing per page
// that should win; `supporting` is an elevated standalone module (border +
// a soft shadow); `raw` is the same surface without the lift, for a card
// nested inside another or a secondary detail block. One radius across all
// three so cards on a page read as one family.
const TIER_STYLE: Record<CardTier, { bg: string; border: string; shadow: string; padding: string; radius: string }> = {
  // A soft sage-mint panel — used at most once or twice per page (the
  // Insight component, Overview's Today, Food's ranked priorities). The
  // wash is deeper than the page backdrop's faint mint whisper so the card
  // reads as a distinct surface, not a barely-there tint.
  primary: {
    bg: "color-mix(in oklab, var(--brand-mint) 84%, var(--brand-leaf))",
    border: "color-mix(in oklab, var(--brand-leaf) 30%, var(--border-hairline))",
    shadow: "var(--shadow-card)",
    padding: "p-5",
    radius: "rounded-xl",
  },
  // The default standalone module — white, hairline border, and a soft
  // shadow so it reads as a lifted surface against the page rather than one
  // more flat rectangle.
  supporting: { bg: "var(--surface-1)", border: "var(--border-hairline)", shadow: "var(--shadow-card)", padding: "p-5", radius: "rounded-xl" },
  // Same white surface, no lift and tighter padding — for a card nested
  // inside a `supporting` one, or a secondary detail block that shouldn't
  // compete with the panels around it.
  raw: {
    bg: "var(--surface-1)",
    border: "var(--border-hairline)",
    shadow: "none",
    padding: "p-4",
    radius: "rounded-xl",
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
