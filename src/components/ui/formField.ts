/** Shared styling for the app's data-entry fields — one bordered input
 * look and one secondary-text label used across every "Lauva form"
 * (appointment form, reminder/note boards, Wishlist). Keeping it in one
 * place is what stops these drifting apart. */
export const FIELD_CLS = "min-h-11 rounded-[10px] border px-3 py-2 text-sm outline-none focus:border-[color:var(--baseline)]";
export const FIELD_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" } as const;
export const LABEL_CLS = "text-sm font-medium";
export const LABEL_STYLE = { color: "var(--text-secondary)" } as const;

/** Borderless control classes for a `Field` row inside a `FormGroup`. */
export const ROW_TEXT_CLS = "w-full min-w-0 bg-transparent py-0.5 text-sm outline-none placeholder:text-[color:var(--text-muted)]";
export const ROW_INLINE_CLS = "min-w-0 bg-transparent py-1 text-right text-sm outline-none [text-align-last:right] placeholder:text-[color:var(--text-muted)]";
export const ROW_STYLE = { color: "var(--text-primary)" } as const;
