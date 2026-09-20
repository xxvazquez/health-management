/** Shared styling for the app's data-entry fields — one filled input
 * look and one secondary-text label used across every "Lauva form"
 * (appointment form, reminder/note boards, Wishlist). Keeping it in one
 * place is what stops these drifting apart. */
export const FIELD_CLS = "min-h-11 rounded-[10px] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--baseline)]";
export const FIELD_STYLE = { background: "var(--field-fill)", color: "var(--text-primary)" } as const;
export const LABEL_CLS = "text-sm font-medium";
export const LABEL_STYLE = { color: "var(--text-secondary)" } as const;
