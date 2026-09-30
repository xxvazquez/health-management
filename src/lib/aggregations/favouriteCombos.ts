/** One rated eating occasion: a logged meal with a rating, or a rated recipe. */
export interface RatedOccasion {
  items: string[];
  rating: number;
}

export interface RatedCombo {
  /** 2–3 foods, A–Z. */
  items: string[];
  /** Average rating of the occasions that had all of them. */
  average: number;
  /** How many rated occasions had all of them. */
  count: number;
}

/** A combo has to recur before it says anything about taste. */
const MIN_COUNT = 2;
/** Foods in more than this share of rated occasions (salt, milk, oil…)
 * are in everything, so they're left out of combos. */
const MAX_UBIQUITY = 0.6;
/** Above this many foods in one occasion, only pairs are counted. */
const MAX_ITEMS_FOR_TRIOS = 12;

function subsets(items: string[]): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      out.push([items[i], items[j]]);
      if (items.length > MAX_ITEMS_FOR_TRIOS) continue;
      for (let k = j + 1; k < items.length; k++) out.push([items[i], items[j], items[k]]);
    }
  }
  return out;
}

/**
 * Which foods eaten together get the best (or worst) ratings — pairs and
 * trios seen in at least two rated occasions, scored by their average
 * rating. A pair is dropped when a trio containing it covers exactly the
 * same occasions, so the more specific combo is the one shown.
 */
export function ratedCombos(occasions: RatedOccasion[]): RatedCombo[] {
  const usable = occasions.map((o) => Array.from(new Set(o.items)).sort((a, b) => a.localeCompare(b)));
  const frequency = new Map<string, number>();
  for (const items of usable) for (const item of items) frequency.set(item, (frequency.get(item) ?? 0) + 1);
  const tooCommon = (item: string) => occasions.length >= 5 && (frequency.get(item) ?? 0) / occasions.length > MAX_UBIQUITY;

  const stats = new Map<string, { items: string[]; sum: number; count: number }>();
  usable.forEach((items, i) => {
    const kept = items.filter((item) => !tooCommon(item));
    for (const combo of subsets(kept)) {
      const key = combo.join("\u0000");
      const s = stats.get(key) ?? { items: combo, sum: 0, count: 0 };
      s.sum += occasions[i].rating;
      s.count += 1;
      stats.set(key, s);
    }
  });

  const recurring = [...stats.values()].filter((s) => s.count >= MIN_COUNT);
  const trios = recurring.filter((s) => s.items.length === 3);
  return recurring
    .filter((s) => s.items.length === 3 || !trios.some((t) => t.count === s.count && s.items.every((item) => t.items.includes(item))))
    .map((s) => ({ items: s.items, average: Math.round((s.sum / s.count) * 10) / 10, count: s.count }))
    .sort((a, b) => b.average - a.average || b.count - a.count || b.items.length - a.items.length);
}
