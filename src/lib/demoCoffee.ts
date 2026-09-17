import type { CoffeeItem, CoffeeLog } from "@/lib/supabase/coffee";

/** Example coffees + cups for the Log → Coffee tab when signed out —
 * interactive, in-memory only, nothing saved. */
const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function buildDemoCoffeeItems(): CoffeeItem[] {
  return [
    { id: "demo-coffee-item-0", name: "Ethiopia Yirgacheffe", brand: "Blue Bottle", notes: "Floral, bright, citrus", isArchived: false },
    { id: "demo-coffee-item-1", name: "House Blend", brand: "Blue Bottle", notes: "Balanced, nutty, cocoa", isArchived: false },
    { id: "demo-coffee-item-2", name: "Guatemala Antigua", brand: "Local Roastery", notes: "Chocolate, full body", isArchived: false },
  ];
}

export function buildDemoCoffeeLogs(): CoffeeLog[] {
  const raw: [string, number, number, string, number | null, string, string, number | null, string[], string | null][] = [
    // itemId, daysAgo, hour, cafe, price, brewingType, brewingMethod, waterTempC, characteristics, note
    ["demo-coffee-item-0", 0, 8, "Home", null, "Filter", "V60", 94, ["Bright", "Floral"], "Bloomed 30s, a little under-extracted."],
    ["demo-coffee-item-1", 0, 14, "Home", null, "Espresso", "Machine", null, ["Balanced"], null],
    ["demo-coffee-item-2", 1, 9, "Corner café", 18, "Filter", "AeroPress", 92, ["Chocolatey", "Full body"], null],
    ["demo-coffee-item-0", 2, 8, "Home", null, "Filter", "V60", 94, ["Bright"], null],
  ];
  return raw.map(([itemId, daysAgo, hour, cafe, price, brewingType, brewingMethod, waterTempC, characteristics, note], i) => {
    const when = at(daysAgo, hour);
    return {
      id: `demo-coffee-log-${i}`,
      itemId,
      date: isoDate(when),
      loggedAt: when.toISOString(),
      cafe,
      price,
      brewingType,
      brewingMethod,
      waterTempC,
      characteristics,
      note,
    };
  });
}

export function buildDemoCoffeeCurrency(): string {
  return "zł";
}
