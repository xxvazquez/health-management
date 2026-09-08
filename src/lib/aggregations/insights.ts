/** Shared vocabulary for every page-level synthesized insight. `tone`
 * drives which status color (if any) the Insight component uses for its
 * label — and must only ever be set from an evidence- or target-backed
 * judgment (e.g. Food's dietary-guidance engine), never from personal
 * baseline drift alone. Drift tells Lauva what changed; it never by
 * itself tells Lauva what matters. */
export type InsightTone = "good" | "neutral" | "attention" | "serious";

export interface Bullet {
  label: string;
  detail: string;
  /** Same fact as `detail`, condensed to a short "value · context" form
   * for dense card display (e.g. "77% recently · 30% usual") instead of a
   * full sentence. Optional — only set where the underlying numbers are
   * already at hand; callers should fall back to `detail` when absent. */
  compact?: string;
}
