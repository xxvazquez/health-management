import type { ItemType } from "@/taxonomy/categories";
import type { RawCategory } from "@/lib/types";
import { normalizeName } from "@/taxonomy/normalizeName";

/** Sorts one type's category names the way the user arranged them in
 * Settings: ordered categories first by position, then the rest A–Z. */
export function categoryComparator(rows: readonly RawCategory[], itemType: ItemType): (a: string, b: string) => number {
  const position = new Map<string, number>();
  for (const r of rows) if (r.itemType === itemType && r.sortOrder != null) position.set(normalizeName(r.name), r.sortOrder);
  return (a, b) => {
    const pa = position.get(normalizeName(a));
    const pb = position.get(normalizeName(b));
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    return a.localeCompare(b);
  };
}
