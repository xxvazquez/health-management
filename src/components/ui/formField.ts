/** Shared styling for form fields — the secondary-text label above a row
 * and the borderless controls inside it. Keeping it in one place is what
 * stops the forms drifting apart. */
export const LABEL_CLS = "text-sm font-medium";
export const LABEL_STYLE = { color: "var(--text-secondary)" } as const;

/** Borderless control classes for a `Field` row inside a `FormGroup`. */
export const ROW_TEXT_CLS = "row-control w-full min-w-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-[color:var(--text-muted)]";
export const ROW_INLINE_CLS = "row-control min-w-0 bg-transparent py-1 text-right text-sm outline-none [text-align-last:right] placeholder:text-[color:var(--text-muted)]";
export const ROW_STYLE = { color: "var(--text-primary)" } as const;
