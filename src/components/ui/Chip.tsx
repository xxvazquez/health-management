import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import clsx from "clsx";

/** Every value-setting control outside a form — search, meal, time, date —
 * shares this shape: 36px, 10px radius, the raised `.control-surface`.
 * Menus show their value in the tint with an up/down chevron; state changes
 * are never a different shape. */
export const CONTROL_CLS = "control-surface hit-slop inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] px-3 text-sm transition-opacity active:opacity-60";
export const CONTROL_STYLE: CSSProperties = { color: "var(--text-primary)" };

/** Shape of every selectable pill and grid cell in the app — filters,
 * pickers, Log's tap-to-log cells. One height, one radius, one type size. */
export const CHIP_CLS =
  "hit-slop inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border px-2.5 text-left text-sm leading-tight transition-colors active:opacity-70 disabled:opacity-50";

/** Smaller chip for the horizontally-scrolling quick-pick rows ("Your usual",
 * "Products") — same look, less height and type. */
export const CHIP_SM_CLS =
  "hit-slop inline-flex min-h-8 items-center gap-1 rounded-[10px] border px-2.5 text-left text-xs leading-tight transition-colors active:opacity-70 disabled:opacity-50";

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
