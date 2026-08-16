import type { RawItem, RawLog } from "@/lib/types";

/** Every demo item/log identity starts with this — purely in-memory,
 * never written to IndexedDB or Supabase, so it can never mix with real
 * data or leak into a signed-in sync. */
export const DEMO_ID_PREFIX = "demo:";

// Raw names reused verbatim from taxonomy/overrides.json, so every entry
// classifies correctly without touching the taxonomy at all.
const FOODS = [
  "Eat Tomato", "Eat Broccoli", "Eat Carrot", "Eat Onion", "Eat Garlic", "Eat Cauliflower",
  "Eat Banana", "Eat Apple", "Eat Blueberries", "Eat Orange", "Eat Strawberries",
  "Eat Beans", "Eat Chickpeas", "Eat Lentils",
  "Eat Oats", "Eat Rice", "Eat Bread", "Eat Potatoes",
  "Eat Cheese", "Eat Yoghurt", "Eat Eggs", "Drink Milk",
  "Eat Chicken", "Eat Salmon", "Eat Tuna",
  "Eat Almonds", "Eat Walnuts", "Eat Peanut butter",
  "Drink Coffee", "Eat Chocolate",
];
const DAILY_SUPPLEMENTS = ["Vitamin D", "Magnesium"];
const OCCASIONAL_SUPPLEMENTS = ["Vitamin C", "Omega-3", "Iron", "Folate"];
const DAILY_HABIT = "Sleep well";
const OCCASIONAL_HABITS = ["Walk", "Workout", "Take a shower", "Rest 30'"];
const BRISTOL_POOL = ["Bristol 3", "Bristol 4", "Bristol 3", "Bristol 4", "Bristol 2", "Bristol 5"];
const SYMPTOMS = ["Bloating", "Flatulence", "Headache"];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

const DEMO_SEED = 20260101;
const DEMO_WINDOW_DAYS = 75;

/** Small deterministic PRNG (mulberry32) — same seed always produces the
 * exact same sequence, so the "random-looking" demo dataset is actually
 * fully reproducible: identical every time it's built, on every machine. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function demoItemIdentity(rawName: string): string {
  return `${DEMO_ID_PREFIX}${rawName.toLowerCase().replace(/\s+/g, "-")}`;
}

export interface DemoDataset {
  items: RawItem[];
  logs: RawLog[];
}

/**
 * Builds a plausible-looking, fully deterministic demo dataset — same
 * content every time, anchored to today so it always reads as current.
 * Pure function: never touches IndexedDB or Supabase. Shown automatically
 * by DataContext whenever nobody's signed in and there's no real local
 * data yet, so the app never looks empty to a first-time visitor.
 */
export function buildDemoDataset(): DemoDataset {
  const rand = mulberry32(DEMO_SEED);
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)];
  const chance = (p: number): boolean => rand() < p;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const createdDate = isoDate(new Date(today.getTime() - DEMO_WINDOW_DAYS * 86_400_000));

  const itemsByName = new Map<string, RawItem>();
  const logs: RawLog[] = [];
  let logCounter = 0;

  function ensureItem(rawName: string): string {
    const identity = demoItemIdentity(rawName);
    if (!itemsByName.has(rawName)) {
      itemsByName.set(rawName, {
        identity,
        rawName,
        unit: null,
        kind: null,
        frequency: null,
        isRemoved: false,
        createdDate,
      });
    }
    return identity;
  }

  function writeLog(itemIdentity: string, date: string, mealTag: string | null): void {
    logCounter++;
    logs.push({
      identity: `${DEMO_ID_PREFIX}log:${itemIdentity}:${date}:${logCounter}`,
      itemIdentity,
      date,
      value: 1,
      goalValue: null,
      isSkipped: false,
      updatedAt: new Date(`${date}T12:00:00`).getTime(),
      mealTag,
    });
  }

  for (let dayOffset = DEMO_WINDOW_DAYS; dayOffset >= 0; dayOffset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - dayOffset);
    const date = isoDate(d);

    // Skip some days entirely — real tracking has gaps too.
    if (chance(0.08)) continue;

    const foodCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < foodCount; i++) {
      writeLog(ensureItem(pick(FOODS)), date, pick(MEALS));
    }

    for (const rawName of DAILY_SUPPLEMENTS) {
      if (chance(0.85)) writeLog(ensureItem(rawName), date, null);
    }
    if (chance(0.3)) writeLog(ensureItem(pick(OCCASIONAL_SUPPLEMENTS)), date, null);

    if (chance(0.75)) writeLog(ensureItem(DAILY_HABIT), date, null);
    if (chance(0.5)) writeLog(ensureItem(pick(OCCASIONAL_HABITS)), date, null);

    if (chance(0.7)) writeLog(ensureItem(pick(BRISTOL_POOL)), date, null);
    if (chance(0.15)) writeLog(ensureItem(pick(SYMPTOMS)), date, null);
  }

  return { items: Array.from(itemsByName.values()), logs };
}
