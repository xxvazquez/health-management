import type { AnchorHTMLAttributes, ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import Link from "next/link";
import clsx from "clsx";

type ButtonVariant = "primary" | "outline" | "quiet";
type ButtonSize = "sm" | "md" | "lg";

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-3 py-2 text-sm",
  lg: "px-5 py-2 text-sm",
};

const BASE_CLS = "inline-flex items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors disabled:opacity-50";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fill color for `primary`, ignored otherwise — defaults to the app's
   * neutral accent so a call site only needs this when it wants to match
   * a page's own accent (e.g. a Log tab's color). */
  accent?: string;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps & { href?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;
type ButtonAsLink = CommonProps & { href: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children">;

function variantStyle(variant: ButtonVariant, accent: string): CSSProperties {
  if (variant === "primary") return { background: accent, color: "#fff" };
  if (variant === "outline") return { borderColor: "var(--border-hairline)", color: "var(--text-secondary)" };
  return { color: "var(--text-secondary)" };
}

/**
 * The one filled/outline/text button, replacing the hand-rolled
 * `rounded-md px-{3,4,5} py-{1.5,2}` combinations that had drifted across
 * dialogs, empty states, and the reset page. Renders a `<Link>` when
 * `href` is given, a `<button>` otherwise — same look either way, since
 * "go somewhere" and "do something" are visually the same kind of action
 * here. Board forms (`TaskForm`, `NoteForm`, etc.) aren't migrated yet —
 * they have their own submit/cancel pairing and were left for a follow-up.
 */
export function Button({ variant = "primary", size = "md", accent = "var(--series-1)", className, children, href, ...rest }: ButtonAsButton | ButtonAsLink) {
  const cls = clsx(BASE_CLS, SIZE_CLS[size], variant === "outline" && "border", className);
  const style = variantStyle(variant, accent);

  if (href !== undefined) {
    return (
      <Link href={href} className={cls} style={style} {...(rest as Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children">)}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} style={style} {...(rest as Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">)}>
      {children}
    </button>
  );
}
