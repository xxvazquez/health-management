import type { FoodCategory } from "./categories";

/**
 * Foods realistically available in a Polish supermarket or greengrocer,
 * grouped by the same categories the rest of the app uses. Backs the Log
 * page's Food tab so browsing isn't limited to what's already been tapped
 * before — every name here is tappable even on its first-ever log.
 *
 * Deliberately excludes genuinely exotic/rare produce (dragon fruit, guava,
 * passionfruit, lychee, papaya) — not realistic for a routine grocery run —
 * even though foodKeywords.json and nutritionGroups.ts still classify them
 * correctly if someone logs one by hand. Includes staples specific to the
 * Polish market (buckwheat and millet groats, twaróg, kiełbasa, herring,
 * rapeseed oil) alongside the common year-round imported produce every
 * supermarket here carries.
 */
export const POLAND_FOOD_CATALOG: Record<FoodCategory, string[]> = {
  Veggies: [
    "Carrot", "Onion", "Garlic", "Potatoes", "Sweet potato", "Cabbage", "Red cabbage",
    "Cauliflower", "Broccoli", "Brussels sprouts", "Kohlrabi", "Beetroot", "Celeriac",
    "Parsnip", "Turnip", "Leek", "Cucumber", "Tomato", "Bell pepper", "Zucchini",
    "Eggplant", "Pumpkin", "Radish", "Spinach", "Kale", "Lettuce", "Mushrooms",
    "Asparagus", "Fennel", "Chives", "Ginger", "Jerusalem artichoke",
  ],
  Fruit: [
    "Apple", "Pear", "Banana", "Orange", "Mandarin", "Lemon", "Lime", "Grapefruit",
    "Kiwi", "Grapes", "Strawberries", "Raspberries", "Blueberries", "Blackberry",
    "Cranberry", "Gooseberry", "Redcurrant", "Blackcurrant", "Cherry", "Plum",
    "Apricot", "Peach", "Nectarine", "Watermelon", "Melon", "Pineapple", "Mango",
    "Avocado", "Rhubarb", "Quince", "Pomegranate",
  ],
  Legumes: ["Beans", "Chickpeas", "Lentils", "Peas", "Edamame", "Tofu", "Tempeh"],
  Grains: [
    "Bread", "Rye bread", "Rice", "Pasta", "Oats", "Buckwheat", "Barley", "Millet",
    "Bulgur", "Couscous", "Quinoa", "Corn", "Polenta", "Crackers", "Tortilla",
  ],
  Dairy: ["Milk", "Yoghurt", "Kefir", "Cheese", "Cottage cheese", "Feta", "Cream", "Eggs"],
  "Dairy Alternatives": ["Oat milk", "Almond milk", "Soy milk", "Rice milk", "Millet milk", "Coconut milk"],
  Meat: ["Chicken", "Turkey", "Beef", "Pork", "Sausage", "Ham", "Bacon"],
  Fish: ["Salmon", "Trout", "Herring", "Mackerel", "Cod", "Tuna"],
  "Nuts & Seeds": [
    "Almonds", "Walnuts", "Hazelnuts", "Cashews", "Peanuts", "Peanut butter",
    "Pistachios", "Sunflower seeds", "Pumpkin seeds", "Flaxseeds", "Chia", "Sesame seeds", "Tahini",
  ],
  Fats: ["Butter", "Ghee", "Olive oil", "Rapeseed oil"],
  Misc: ["Coffee", "Tea", "Chocolate", "Honey", "Sugar", "Vinegar", "Mustard", "Broth"],
};
