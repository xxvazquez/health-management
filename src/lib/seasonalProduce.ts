/**
 * Month -> produce that's actually in season in Poland's climate (roughly:
 * short intense summer, root vegetables carrying most of autumn/winter from
 * storage, an early-spring gap before the first greens). Names are plain
 * Title Case so they can be matched directly against tracked food items —
 * an exact string match isn't required elsewhere in the app, so a loose
 * match is fine here too.
 *
 * Approximate by nature (a real harvest shifts with the weather year to
 * year) — treat this as a nudge toward variety, not a precise almanac.
 * Compiled from the EU's official temperate-climate produce calendar
 * (agriculture.ec.europa.eu, which names Poland explicitly) cross-checked
 * against a Polish month-by-month seasonal guide (mamyito.pl).
 */
export const POLAND_SEASONAL_PRODUCE: Record<number, string[]> = {
  1: ["Beetroot", "Cabbage", "Carrot", "Celeriac", "Leek", "Parsnip", "Kale", "Apple", "Pear"],
  2: ["Beetroot", "Cabbage", "Carrot", "Celeriac", "Leek", "Parsnip", "Kale", "Brussels Sprouts", "Apple", "Pear"],
  3: ["Cabbage", "Carrot", "Celeriac", "Leek", "Radish", "Chives", "Nettle", "Apple", "Pear"],
  4: ["Asparagus", "Spinach", "Radish", "Wild Garlic", "Sorrel", "Rhubarb", "Lettuce"],
  5: ["Asparagus", "Kohlrabi", "Peas", "Carrot", "Spinach", "Radish", "Strawberry", "Rhubarb", "Gooseberry"],
  6: ["Zucchini", "Broccoli", "Cauliflower", "Kohlrabi", "Cucumber", "Tomato", "Strawberry", "Cherry", "Gooseberry", "Raspberry"],
  7: ["Eggplant", "Broccoli", "Cauliflower", "Fennel", "Cucumber", "Tomato", "Pepper", "Cherry", "Currant", "Blueberry", "Plum"],
  8: ["Eggplant", "Zucchini", "Corn", "Pepper", "Tomato", "Raspberry", "Blueberry", "Peach", "Plum", "Blackberry"],
  9: ["Brussels Sprouts", "Beetroot", "Cabbage", "Zucchini", "Pepper", "Tomato", "Leek", "Apple", "Pear", "Grapes", "Plum"],
  10: ["Pumpkin", "Brussels Sprouts", "Beetroot", "Kale", "Cauliflower", "Carrot", "Parsnip", "Celeriac", "Leek", "Apple", "Pear", "Grapes", "Cranberry"],
  11: ["Turnip", "Brussels Sprouts", "Beetroot", "Kale", "Cabbage", "Carrot", "Parsnip", "Celeriac", "Leek", "Jerusalem Artichoke", "Apple", "Pear"],
  12: ["Beetroot", "Turnip", "Brussels Sprouts", "Kale", "Cabbage", "Carrot", "Parsnip", "Celeriac", "Leek", "Apple", "Pear"],
};
