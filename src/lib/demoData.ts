import type { RawItem, RawLog, RawWorkoutLog, RawStoolLog, RawPeriodLog, PeriodIntensity, WorkoutExercise } from "@/lib/types";
import { COLLECTION_METHODS } from "@/lib/types";
import type { ItemType } from "@/taxonomy/categories";

/** Every demo item/log identity starts with this — purely in-memory,
 * never written to IndexedDB or Supabase, so it can never mix with real
 * data or leak into a signed-in sync. */
export const DEMO_ID_PREFIX = "demo:";

// [name, category] tuples — explicit now that there's no more name-matched
// classification to infer a category from. Category is a real column on
// every item; the demo dataset sets it directly, same as a real user would
// when adding an item.
const FOODS: [string, string][] = [
  ["Tomato", "Veggies"], ["Broccoli", "Veggies"], ["Carrot", "Veggies"], ["Onion", "Veggies"],
  ["Garlic", "Veggies"], ["Cauliflower", "Veggies"], ["Spinach", "Veggies"], ["Kale", "Veggies"],
  ["Banana", "Fruit"], ["Apple", "Fruit"], ["Blueberries", "Fruit"], ["Orange", "Fruit"], ["Strawberries", "Fruit"],
  ["Beans", "Legumes"], ["Chickpeas", "Legumes"], ["Lentils", "Legumes"],
  ["Oats", "Grains"], ["Rice", "Grains"], ["Bread", "Grains"], ["Potatoes", "Veggies"],
  ["Cheese", "Dairy"], ["Yoghurt", "Dairy"], ["Eggs", "Dairy"], ["Milk", "Dairy"],
  ["Chicken", "Meat"], ["Salmon", "Fish"], ["Tuna", "Fish"], ["Cod", "Fish"],
  ["Almonds", "Nuts & Seeds"], ["Walnuts", "Nuts & Seeds"], ["Peanut butter", "Nuts & Seeds"], ["Chia", "Nuts & Seeds"],
  ["Coffee", "Misc"], ["Chocolate", "Misc"],
];
const DAILY_SUPPLEMENTS: [string, string][] = [
  ["Vitamin D", "Vitamins"],
  ["Magnesium", "Minerals"],
];
const OCCASIONAL_SUPPLEMENTS: [string, string][] = [
  ["Vitamin C", "Vitamins"],
  ["Omega-3", "Omega-3"],
  ["Iron", "Minerals"],
  ["Folate", "Vitamins"],
];
const DAILY_HABIT: [string, string] = ["Sleep", "Daily"];
const OCCASIONAL_HABITS: [string, string][] = [
  ["Workout", "Body"],
  ["Walk", "Body"],
  ["Physiotherapy", "Body"],
  ["Stretch", "Body"],
  ["Take a shower", "Daily"],
  ["Read", "Daily"],
  ["Meditate", "Daily"],
  ["Fasting", "Food"],
  ["No alcohol", "Food"],
];
const SYMPTOMS: [string, string][] = [
  ["Bloating", "Digestive Symptom"],
  ["Flatulence", "Digestive Symptom"],
  ["Headache", "Other Symptom"],
];
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"] as const;

/** A handful of realistic recurring combos, logged on top of the random
 * daily foods above — without this, exact-set repeats across independently
 * random days are vanishingly rare, so "Favorite combinations by meal"
 * would have nothing to show in the demo. Purely additive to the existing
 * generator (same deterministic PRNG stream), not a second algorithm —
 * favoriteCombosByMeal itself is untouched and just finds these like it
 * would find any real recurring meal. */
const SIGNATURE_MEALS: { meal: (typeof MEALS)[number]; items: [string, string][]; chance: number }[] = [
  { meal: "Breakfast", items: [["Oats", "Grains"], ["Blueberries", "Fruit"], ["Almonds", "Nuts & Seeds"]], chance: 0.4 },
  { meal: "Lunch", items: [["Chicken", "Meat"], ["Rice", "Grains"], ["Broccoli", "Veggies"]], chance: 0.35 },
  { meal: "Dinner", items: [["Salmon", "Fish"], ["Potatoes", "Veggies"], ["Spinach", "Veggies"]], chance: 0.35 },
  { meal: "Snack", items: [["Peanut butter", "Nuts & Seeds"], ["Apple", "Fruit"]], chance: 0.3 },
];

const DEMO_SEED = 20260101;
const DEMO_WINDOW_DAYS = 75;

/** A handful of core lifts, each trained roughly weekly with a plausible
 * upward trend — enough for the Strength Progress table and its charts to
 * have something real to show (started/current/best all differ) instead
 * of the Workout page just being the one dashboard demo mode leaves empty. */
const WORKOUT_PROGRESSIONS: { exercise: WorkoutExercise; startKg: number; incrementKg: number; cadenceDays: number; phase: number }[] = [
  { exercise: "Squat", startKg: 60, incrementKg: 2.5, cadenceDays: 7, phase: 2 },
  { exercise: "Deadlift", startKg: 70, incrementKg: 2.5, cadenceDays: 7, phase: 5 },
  { exercise: "Bench Press", startKg: 40, incrementKg: 1.25, cadenceDays: 7, phase: 0 },
];

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
  workoutLogs: RawWorkoutLog[];
  stoolLogs: RawStoolLog[];
  periodLogs: RawPeriodLog[];
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

  function ensureItem(itemType: ItemType, rawName: string, category: string): string {
    const identity = demoItemIdentity(rawName);
    if (!itemsByName.has(rawName)) {
      itemsByName.set(rawName, {
        identity,
        itemType,
        rawName,
        category,
        categoryId: null,
        isArchived: false,
        createdDate,
        reminderTime: null,
        unit: itemType === "workout" ? "kg" : null,
      });
    }
    return identity;
  }

  function writeLog(itemIdentity: string, itemType: ItemType, date: string, mealTag: string | null): void {
    logCounter++;
    logs.push({
      identity: `${DEMO_ID_PREFIX}log:${itemIdentity}:${date}:${logCounter}`,
      itemIdentity,
      itemType,
      date,
      value: 1,
      updatedAt: new Date(`${date}T12:00:00`).toISOString(),
      mealTag,
    });
  }

  const stoolLogs: RawStoolLog[] = [];
  let stoolCounter = 0;
  // Weighted toward the 3–4 target range, with occasional wider readings —
  // same shape a real, mostly-in-range logger's history looks like.
  const BRISTOL_POOL = [3, 4, 3, 4, 2, 5, 3, 4, 6];

  for (let dayOffset = DEMO_WINDOW_DAYS; dayOffset >= 0; dayOffset--) {
    const d = new Date(today);
    d.setDate(d.getDate() - dayOffset);
    const date = isoDate(d);

    // Skip some days entirely — real tracking has gaps too.
    if (chance(0.08)) continue;

    const foodCount = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < foodCount; i++) {
      const [name, category] = pick(FOODS);
      writeLog(ensureItem("food", name, category), "food", date, pick(MEALS));
    }

    for (const signature of SIGNATURE_MEALS) {
      if (!chance(signature.chance)) continue;
      for (const [name, category] of signature.items) {
        writeLog(ensureItem("food", name, category), "food", date, signature.meal);
      }
    }

    for (const [name, category] of DAILY_SUPPLEMENTS) {
      if (chance(0.85)) writeLog(ensureItem("supplement", name, category), "supplement", date, null);
    }
    if (chance(0.3)) {
      const [name, category] = pick(OCCASIONAL_SUPPLEMENTS);
      writeLog(ensureItem("supplement", name, category), "supplement", date, null);
    }

    if (chance(0.75)) writeLog(ensureItem("habit", DAILY_HABIT[0], DAILY_HABIT[1]), "habit", date, null);
    if (chance(0.5)) {
      const [name, category] = pick(OCCASIONAL_HABITS);
      writeLog(ensureItem("habit", name, category), "habit", date, null);
    }

    if (chance(0.15)) {
      const [name, category] = pick(SYMPTOMS);
      writeLog(ensureItem("outcome", name, category), "outcome", date, null);
    }

    if (chance(0.7)) {
      stoolCounter++;
      const bristolScores = chance(0.12) ? [pick(BRISTOL_POOL), pick(BRISTOL_POOL)] : [pick(BRISTOL_POOL)];
      stoolLogs.push({
        id: `${DEMO_ID_PREFIX}stool:${stoolCounter}`,
        date,
        loggedAt: new Date(`${date}T09:00:00`).toISOString(),
        bristolScores,
        color: "Brown",
        floatation: chance(0.1) ? (chance(0.5) ? "Floats" : "Partially Floats") : null,
        isSticky: chance(0.1),
        isSmelly: chance(0.08),
        isStraining: chance(0.05),
        hygiene: chance(0.6) ? ["Clean"] : ["Slightly Dirty"],
        symptoms: chance(0.08) ? ["Urgency"] : chance(0.06) ? ["Incomplete evacuation"] : [],
        timeOnToiletMinutes: 3 + Math.floor(rand() * 8),
        note: null,
        updatedAt: new Date(`${date}T09:00:00`).toISOString(),
      });
    }
  }

  const workoutLogs: RawWorkoutLog[] = [];
  let workoutCounter = 0;
  for (const prog of WORKOUT_PROGRESSIONS) {
    // Same registry every real user gets via ensureDefaultWorkoutItems —
    // without this, demo mode's row-per-exercise Workout tab would have
    // nothing to render despite workoutLogs below having real history.
    ensureItem("workout", prog.exercise, "Strength Training");
    let weightKg = prog.startKg;
    for (let dayOffset = DEMO_WINDOW_DAYS; dayOffset >= 0; dayOffset--) {
      if (dayOffset % prog.cadenceDays !== prog.phase) continue;
      if (chance(0.1)) continue; // skipped session — training has gaps too
      if (chance(0.55)) weightKg += prog.incrementKg;

      const d = new Date(today);
      d.setDate(d.getDate() - dayOffset);
      const date = isoDate(d);
      workoutCounter++;
      workoutLogs.push({
        id: `${DEMO_ID_PREFIX}workout:${prog.exercise}:${workoutCounter}`,
        date,
        exercise: prog.exercise,
        weightKg,
        updatedAt: new Date(`${date}T18:00:00`).getTime(),
      });
    }
  }

  // Anchored further back than DEMO_WINDOW_DAYS (unlike food/stool/workout
  // above) so the Analysis section has more than one completed cycle to
  // compute a real average/variation from, not just the single most recent
  // one — a lone data point would make "variation" meaningless.
  const periodLogs: RawPeriodLog[] = [];
  let periodCounter = 0;
  const CYCLE_LENGTH_POOL = [25, 26, 27, 27, 28, 29, 30];
  const PERIOD_INTENSITY_BY_DAY: PeriodIntensity[] = ["Heavy", "Heavy", "Medium", "Medium", "Light", "Light"];
  let cycleStart = new Date(today);
  cycleStart.setDate(cycleStart.getDate() - 165);
  while (cycleStart <= today) {
    const periodLength = 4 + Math.floor(rand() * 3); // 4–6 days
    const methods = chance(0.5) ? [pick(COLLECTION_METHODS)] : [pick(COLLECTION_METHODS), pick(COLLECTION_METHODS)];
    for (let day = 0; day < periodLength; day++) {
      const d = new Date(cycleStart);
      d.setDate(d.getDate() + day);
      if (d > today) break;
      const date = isoDate(d);
      periodCounter++;
      periodLogs.push({
        id: `${DEMO_ID_PREFIX}period:${periodCounter}`,
        date,
        intensity: PERIOD_INTENSITY_BY_DAY[Math.min(day, PERIOD_INTENSITY_BY_DAY.length - 1)],
        collectionMethods: Array.from(new Set(methods)),
        updatedAt: new Date(`${date}T09:00:00`).getTime(),
      });
    }
    const next = new Date(cycleStart);
    next.setDate(next.getDate() + pick(CYCLE_LENGTH_POOL));
    cycleStart = next;
  }

  return { items: Array.from(itemsByName.values()), logs, workoutLogs, stoolLogs, periodLogs };
}
