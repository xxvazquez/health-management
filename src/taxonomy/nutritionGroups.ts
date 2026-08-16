/**
 * Nutrition-group taxonomy: a second, finer-grained classification layer on
 * top of the 8 broad FOOD_CATEGORIES (categories.ts). Where FOOD_CATEGORIES
 * answers "is this a vegetable or a fish", this answers "is it a leafy
 * green or a cruciferous vegetable", "is it fatty fish or white fish" —
 * the level dietary-pattern analysis actually needs.
 *
 * This never replaces FOOD_CATEGORIES (still used for Log page grouping,
 * the category timeline chart, etc.) — it's an additive layer read only by
 * the nutrition-priorities engine. A food that can't be reliably placed in
 * one of these groups (an ambiguous "bread", a plant-milk, a herb) simply
 * gets no group rather than a guessed one; it still counts toward general
 * food-variety stats, just not toward any specific group's coverage.
 */

export const NUTRITION_GROUPS = [
  "leafy_greens",
  "cruciferous",
  "other_vegetables",
  "berries",
  "other_fruit",
  "legumes",
  "whole_grains",
  "refined_grains",
  "nuts",
  "seeds",
  "fatty_fish",
  "other_seafood",
  "poultry",
  "eggs",
  "fermented_dairy",
  "dairy_other",
  "olive_oil",
  "other_unsaturated_fat",
  "processed_meat",
  "red_meat",
  "highly_processed",
] as const;

export type NutritionGroupId = (typeof NUTRITION_GROUPS)[number];

export const NUTRITION_GROUP_LABEL: Record<NutritionGroupId, string> = {
  leafy_greens: "Leafy greens",
  cruciferous: "Cruciferous vegetables",
  other_vegetables: "Other vegetables",
  berries: "Berries",
  other_fruit: "Other fruit",
  legumes: "Legumes",
  whole_grains: "Whole grains",
  refined_grains: "Other/refined grains",
  nuts: "Nuts",
  seeds: "Seeds",
  fatty_fish: "Fatty fish",
  other_seafood: "Other fish & seafood",
  poultry: "Poultry",
  eggs: "Eggs",
  fermented_dairy: "Fermented dairy",
  dairy_other: "Other dairy",
  olive_oil: "Olive oil",
  other_unsaturated_fat: "Other unsaturated fats",
  processed_meat: "Processed meat",
  red_meat: "Red meat",
  highly_processed: "Highly processed foods",
};

/** Broad dietary "pillars" — the level most insight copy is written at. */
export const PILLARS = ["vegetables", "fruit", "legumes", "grains", "nuts_seeds", "fish", "protein_other", "fats", "dairy", "discretionary"] as const;
export type PillarId = (typeof PILLARS)[number];

export const PILLAR_LABEL: Record<PillarId, string> = {
  vegetables: "Vegetables",
  fruit: "Fruit",
  legumes: "Legumes",
  grains: "Grains",
  nuts_seeds: "Nuts & seeds",
  fish: "Fish & seafood",
  protein_other: "Other protein foods",
  fats: "Fats & oils",
  dairy: "Dairy",
  discretionary: "Discretionary foods",
};

export const PILLAR_GROUPS: Record<PillarId, NutritionGroupId[]> = {
  vegetables: ["leafy_greens", "cruciferous", "other_vegetables"],
  fruit: ["berries", "other_fruit"],
  legumes: ["legumes"],
  grains: ["whole_grains", "refined_grains"],
  nuts_seeds: ["nuts", "seeds"],
  fish: ["fatty_fish", "other_seafood"],
  protein_other: ["poultry", "eggs", "red_meat", "processed_meat"],
  fats: ["olive_oil", "other_unsaturated_fat"],
  dairy: ["fermented_dairy", "dairy_other"],
  discretionary: ["highly_processed"],
};

export function pillarForGroup(group: NutritionGroupId): PillarId {
  for (const pillar of PILLARS) {
    if (PILLAR_GROUPS[pillar].includes(group)) return pillar;
  }
  return "discretionary";
}

/**
 * Groups the priorities engine treats as candidates worth recommending more
 * of. Deliberately narrow (component G: practicality) — informational-only
 * groups (poultry, eggs, dairy, red/processed meat, refined grains,
 * discretionary foods, fats) are tracked for classification and the
 * detailed table, but the engine never tells anyone to "eat more" of them.
 */
export const PRIORITY_ELIGIBLE_GROUPS: NutritionGroupId[] = [
  "leafy_greens",
  "cruciferous",
  "other_vegetables",
  "berries",
  "other_fruit",
  "legumes",
  "whole_grains",
  "nuts",
  "seeds",
  "fatty_fish",
];

/**
 * Keyword -> group(s), matched against the same normalized canonical item
 * name classify.ts already produces (e.g. "Blueberries", "Salmon"). Longest
 * keyword wins, mirroring foodKeywords.json's own matching strategy. A food
 * can carry a second tag when it meaningfully serves two roles (avocado is
 * both a fruit and a notable unsaturated-fat source).
 */
const GROUP_KEYWORDS: Record<string, NutritionGroupId[]> = {
  // Leafy greens
  spinach: ["leafy_greens"], kale: ["leafy_greens"], lettuce: ["leafy_greens"],
  watercress: ["leafy_greens"], endive: ["leafy_greens"], chicory: ["leafy_greens"],
  nettle: ["leafy_greens"], sorrel: ["leafy_greens"], "wild garlic": ["leafy_greens"],
  arugula: ["leafy_greens"], chard: ["leafy_greens"], "collard greens": ["leafy_greens"],
  rocket: ["leafy_greens"],

  // Cruciferous
  broccoli: ["cruciferous"], cauliflower: ["cruciferous"], cabbage: ["cruciferous"],
  "brussels sprout": ["cruciferous"], kohlrabi: ["cruciferous"], radish: ["cruciferous"],
  turnip: ["cruciferous"], "bok choy": ["cruciferous"],

  // Other vegetables
  cucumber: ["other_vegetables"], celery: ["other_vegetables"], asparagus: ["other_vegetables"],
  eggplant: ["other_vegetables"], aubergine: ["other_vegetables"], pumpkin: ["other_vegetables"],
  squash: ["other_vegetables"], beet: ["other_vegetables"], beetroot: ["other_vegetables"],
  artichoke: ["other_vegetables"], "jerusalem artichoke": ["other_vegetables"], peas: ["other_vegetables"],
  tomato: ["other_vegetables"], fennel: ["other_vegetables"], zucchini: ["other_vegetables"],
  courgette: ["other_vegetables"], parsnip: ["other_vegetables"], chives: ["other_vegetables"],
  mushroom: ["other_vegetables"], chanterelle: ["other_vegetables"], leek: ["other_vegetables"],
  celeriac: ["other_vegetables"], "bell pepper": ["other_vegetables"], pepper: ["other_vegetables"],
  onion: ["other_vegetables"], garlic: ["other_vegetables"], carrot: ["other_vegetables"],
  ginger: ["other_vegetables"], "sweet potato": ["other_vegetables"], potato: ["other_vegetables"],
  potatoes: ["other_vegetables"], sprouts: ["other_vegetables"],

  // Berries
  blueberry: ["berries"], blueberries: ["berries"], raspberry: ["berries"], raspberries: ["berries"],
  strawberry: ["berries"], strawberries: ["berries"], "wild strawberry": ["berries"],
  "wild strawberries": ["berries"], blackberry: ["berries"], blackberries: ["berries"],
  cranberry: ["berries"], cranberries: ["berries"], gooseberry: ["berries"], gooseberries: ["berries"],
  currant: ["berries"], redcurrant: ["berries"], blackcurrant: ["berries"], aronia: ["berries"],
  chokeberry: ["berries"],

  // Other fruit
  apple: ["other_fruit"], banana: ["other_fruit"], orange: ["other_fruit"], pear: ["other_fruit"],
  mandarin: ["other_fruit"], tangerine: ["other_fruit"], clementine: ["other_fruit"],
  mango: ["other_fruit"], kiwi: ["other_fruit"], dates: ["other_fruit"], grape: ["other_fruit"],
  melon: ["other_fruit"], watermelon: ["other_fruit"], pineapple: ["other_fruit"],
  cherry: ["other_fruit"], cherries: ["other_fruit"], plum: ["other_fruit"], apricot: ["other_fruit"],
  fig: ["other_fruit"], papaya: ["other_fruit"], pomegranate: ["other_fruit"], lemon: ["other_fruit"],
  lime: ["other_fruit"], grapefruit: ["other_fruit"], raisins: ["other_fruit"], lychee: ["other_fruit"],
  passionfruit: ["other_fruit"], guava: ["other_fruit"], rhubarb: ["other_fruit"],
  quince: ["other_fruit"], peach: ["other_fruit"], nectarine: ["other_fruit"],
  "nectarine/peach": ["other_fruit"],
  avocado: ["other_fruit", "other_unsaturated_fat"],

  // Legumes
  bean: ["legumes"], beans: ["legumes"], lentil: ["legumes"], lentils: ["legumes"],
  chickpea: ["legumes"], chickpeas: ["legumes"], soybean: ["legumes"], edamame: ["legumes"],
  tofu: ["legumes"], tempeh: ["legumes"],

  // Whole grains (only where the name itself signals the whole/intact form)
  oat: ["whole_grains"], oats: ["whole_grains"], quinoa: ["whole_grains"], barley: ["whole_grains"],
  buckwheat: ["whole_grains"], bulgur: ["whole_grains"], spelt: ["whole_grains"],
  millet: ["whole_grains"], "popped millet": ["whole_grains"], "brown rice": ["whole_grains"],
  "wild rice": ["whole_grains"], "whole wheat": ["whole_grains"], "whole grain": ["whole_grains"],

  // Other / unspecified grains — not asserted refined, just not confirmed whole
  bread: ["refined_grains"], pasta: ["refined_grains"], "wheat pasta": ["refined_grains"],
  "white pasta": ["refined_grains"], rice: ["refined_grains"], wheat: ["refined_grains"],
  cereal: ["refined_grains"], cracker: ["refined_grains"], tortilla: ["refined_grains"],
  noodle: ["refined_grains"], grain: ["refined_grains"], corn: ["refined_grains"],
  polenta: ["refined_grains"], couscous: ["refined_grains"],

  // Nuts
  almond: ["nuts"], almonds: ["nuts"], walnut: ["nuts"], walnuts: ["nuts"], cashew: ["nuts"],
  pistachio: ["nuts"], hazelnut: ["nuts"], "hazelnut butter": ["nuts"], "hazelnut paste": ["nuts"],
  peanut: ["nuts"], "peanut butter": ["nuts"], nut: ["nuts"],

  // Seeds
  chia: ["seeds"], flaxseed: ["seeds"], flaxseeds: ["seeds"], sesame: ["seeds"],
  "sesame seeds": ["seeds"], "sunflower seed": ["seeds"], "pumpkin seed": ["seeds"],
  "hemp seed": ["seeds"], "hemp seeds": ["seeds"], tahini: ["seeds"], seed: ["seeds"],

  // Fish — fatty vs. other, the distinction the taxonomy previously collapsed
  salmon: ["fatty_fish"], mackerel: ["fatty_fish"], sardine: ["fatty_fish"], herring: ["fatty_fish"],
  trout: ["fatty_fish"], tuna: ["fatty_fish"],
  fish: ["other_seafood"], cod: ["other_seafood"], shrimp: ["other_seafood"], prawn: ["other_seafood"],
  seafood: ["other_seafood"], mussel: ["other_seafood"], crab: ["other_seafood"], lobster: ["other_seafood"],

  // Other protein
  chicken: ["poultry"], turkey: ["poultry"],
  beef: ["red_meat"], pork: ["red_meat"], lamb: ["red_meat"], steak: ["red_meat"], meat: ["red_meat"],
  sausage: ["processed_meat"], bacon: ["processed_meat"], ham: ["processed_meat"],
  "jamón serrano": ["processed_meat"], "jamon serrano": ["processed_meat"], jamón: ["processed_meat"],
  jamon: ["processed_meat"], serrano: ["processed_meat"],
  egg: ["eggs"], eggs: ["eggs"],

  // Dairy
  yoghurt: ["fermented_dairy"], yogurt: ["fermented_dairy"], kefir: ["fermented_dairy"],
  cheese: ["fermented_dairy"], feta: ["fermented_dairy"],
  milk: ["dairy_other"], cream: ["dairy_other"], "cream (dairy)": ["dairy_other"], butter: ["dairy_other"],

  // Fats
  "olive oil": ["olive_oil"], "extra virgin olive oil": ["olive_oil"], "extra-virgin olive oil": ["olive_oil"],

  // Discretionary / highly processed
  chocolate: ["highly_processed"], candy: ["highly_processed"], cake: ["highly_processed"],
  cookie: ["highly_processed"], dessert: ["highly_processed"], "ice cream": ["highly_processed"],
  sugar: ["highly_processed"], pastry: ["highly_processed"],
};

/** Longest-keyword-first, same strategy as classify.ts's food-keyword lookup. */
const KEYWORD_ENTRIES = Object.entries(GROUP_KEYWORDS).sort((a, b) => b[0].length - a[0].length);

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Nutrition group(s) for a canonical food item name. Returns an empty array
 * when the food can't be reliably placed — that's a valid, expected result
 * for herbs, condiments, plant-milks, and other items with no clean fit;
 * callers must not guess a group in that case.
 */
export function nutritionGroupsForFood(canonicalItemName: string): NutritionGroupId[] {
  const norm = normalize(canonicalItemName);
  for (const [keyword, groups] of KEYWORD_ENTRIES) {
    if (norm === keyword || norm.includes(keyword)) return groups;
  }
  return [];
}

/**
 * Best-effort botanical-family tagging for a descriptive plant-family
 * diversity stat (item 5) — not exhaustive, and deliberately not used
 * anywhere a precise/complete count is implied. A food with no confident
 * family match returns null rather than a guess.
 */
const PLANT_FAMILY_KEYWORDS: Record<string, string> = {
  broccoli: "Brassicas", cauliflower: "Brassicas", cabbage: "Brassicas", kale: "Brassicas",
  "brussels sprout": "Brassicas", radish: "Brassicas", turnip: "Brassicas", kohlrabi: "Brassicas",
  "bok choy": "Brassicas",
  tomato: "Nightshades", potato: "Nightshades", potatoes: "Nightshades", "bell pepper": "Nightshades",
  pepper: "Nightshades", eggplant: "Nightshades", aubergine: "Nightshades",
  bean: "Legumes (family)", beans: "Legumes (family)", lentil: "Legumes (family)", lentils: "Legumes (family)",
  chickpea: "Legumes (family)", chickpeas: "Legumes (family)", soybean: "Legumes (family)",
  edamame: "Legumes (family)", tofu: "Legumes (family)", tempeh: "Legumes (family)",
  peanut: "Legumes (family)", "peanut butter": "Legumes (family)", peas: "Legumes (family)",
  apple: "Rose family", pear: "Rose family", strawberry: "Rose family", strawberries: "Rose family",
  raspberry: "Rose family", raspberries: "Rose family", blackberry: "Rose family",
  blackberries: "Rose family", cherry: "Rose family", cherries: "Rose family", peach: "Rose family",
  nectarine: "Rose family", plum: "Rose family", apricot: "Rose family", quince: "Rose family",
  cucumber: "Gourds", zucchini: "Gourds", courgette: "Gourds", pumpkin: "Gourds", squash: "Gourds",
  melon: "Gourds", watermelon: "Gourds",
  onion: "Alliums", garlic: "Alliums", leek: "Alliums", chives: "Alliums",
  orange: "Citrus", lemon: "Citrus", lime: "Citrus", mandarin: "Citrus", grapefruit: "Citrus",
  tangerine: "Citrus", clementine: "Citrus",
  lettuce: "Daisy family", artichoke: "Daisy family", "jerusalem artichoke": "Daisy family",
  chicory: "Daisy family", endive: "Daisy family",
  rice: "Grasses", wheat: "Grasses", oat: "Grasses", oats: "Grasses", corn: "Grasses",
  barley: "Grasses", spelt: "Grasses",
  blueberry: "Heath family", blueberries: "Heath family", cranberry: "Heath family",
  cranberries: "Heath family",
  kiwi: "Kiwi family",
  almond: "Rose family", almonds: "Rose family", walnut: "Tree nuts (walnut family)",
  walnuts: "Tree nuts (walnut family)",
};
const PLANT_FAMILY_ENTRIES = Object.entries(PLANT_FAMILY_KEYWORDS).sort((a, b) => b[0].length - a[0].length);

export function plantFamilyForFood(canonicalItemName: string): string | null {
  const norm = normalize(canonicalItemName);
  for (const [keyword, family] of PLANT_FAMILY_ENTRIES) {
    if (norm === keyword || norm.includes(keyword)) return family;
  }
  return null;
}

/** Groups that count as "plant foods" for plant-diversity metrics (item 5). */
export const PLANT_GROUPS: NutritionGroupId[] = [
  "leafy_greens", "cruciferous", "other_vegetables", "berries", "other_fruit",
  "legumes", "whole_grains", "refined_grains", "nuts", "seeds",
];
