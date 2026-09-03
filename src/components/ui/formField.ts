/** Shared styling for the app's data-entry fields — one bordered input
 * look and one secondary-text label used across every "Lauva form"
 * (appointment form, reminder/note boards, Wishlist). Keeping it in one
 * place is what stops these drifting apart. */
export const FIELD_CLS = "rounded-lg border px-3 py-2 text-sm outline-none focus:border-[color:var(--baseline)]";
export const FIELD_STYLE = { borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" } as const;
export const LABEL_CLS = "text-xs font-medium";
export const LABEL_STYLE = { color: "var(--text-secondary)" } as const;
