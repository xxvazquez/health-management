import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import clsx from "clsx";

/** Shape of every selectable pill and grid cell in the app — filters,
 * pickers, Log's tap-to-log cells. One height, one radius, one type size. */
export const CHIP_CLS =
  "inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-left text-sm font-medium leading-tight transition-colors active:opacity-70 disabled:opacity-50";

/** White with a hairline border at rest; tinted in `accent` when on. */
export function chipStyle(active: boolean, accent: string = "var(--ui-accent)"): CSSProperties {
  return {
    background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "var(--surface-1)",
    borderColor: active ? accent : "var(--border-hairline)",
    color: active ? accent : "var(--text-primary)",
  };
}

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "style" | "children"> {
  active?: boolean;
  accent?: string;
  /** Fill the grid cell / row instead of hugging the label. */
  block?: boolean;
  /** Keep a scrolling row's chips from shrinking or wrapping their label. */
  nowrap?: boolean;
  className?: string;
  children: ReactNode;
}

/** The one selectable chip. Toggles report state through `aria-pressed`. */
export function Chip({ active, accent, block, nowrap, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active === undefined ? undefined : active}
      className={clsx(CHIP_CLS, block && "w-full", nowrap && "shrink-0 whitespace-nowrap", className)}
      style={chipStyle(Boolean(active), accent)}
      {...rest}
    >
      {children}
    </button>
  );
}
