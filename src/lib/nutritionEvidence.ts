import type { FoodCategory } from "@/taxonomy/categories";

/**
 * A small, hand-curated table of food-group evidence, sourced from
 * systematic reviews, meta-analyses, and major cohort studies (never
 * generic wellness content). Used only to power the "Foods worth
 * prioritizing" view, which combines this with the user's own logged
 * intake — never shown as a standalone claim.
 *
 * Deliberately kept short: covers the food groups with the best-established
 * general-population evidence, not an exhaustive nutrition database. Add an
 * entry only when it's backed by a real citation below.
 */
export type EvidenceTier = "Strong" | "Moderate" | "Limited" | "Unclear";

export interface EvidenceSource {
  citation: string;
  url: string;
}

export interface FoodEvidenceEntry {
  label: string;
  /** Canonical food-item names in this app's taxonomy that count toward this group's personal-intake tally. */
  matchFoodNames: string[];
  relatedFoodCategory: FoodCategory;
  evidenceTier: EvidenceTier;
  /** Cautious, non-prescriptive summary. Never a disease-treatment or prevention claim. */
  summary: string;
  mechanismOrFinding: string;
  sources: EvidenceSource[];
}

export const FOOD_EVIDENCE: FoodEvidenceEntry[] = [
  {
    label: "Berries",
    matchFoodNames: ["Blueberries", "Raspberries", "Strawberries"],
    relatedFoodCategory: "Fruit",
    evidenceTier: "Moderate",
    summary:
      "Randomized trials feeding anthocyanin-rich berries (mainly blueberries) show modest, fairly consistent improvements in blood lipids, inflammatory markers, and vascular function, and cohort data link higher berry/anthocyanin intake to lower cardiovascular mortality. Effect sizes are generally modest and not every trial shows benefits, so this reads as consistent-but-modest evidence rather than a strong, settled effect.",
    mechanismOrFinding:
      "Rich in anthocyanins/polyphenols; RCTs show reduced LDL-C and CRP and improved endothelial function; cohort studies show roughly 9–27% lower cardiovascular incidence/mortality for high vs. low intake.",
    sources: [
      {
        citation: "Xu L, Tian Z, Chen H, Zhao Y, Yang Y. Anthocyanins, Anthocyanin-Rich Berries, and Cardiovascular Risks: Systematic Review and Meta-Analysis of 44 RCTs and 15 Prospective Cohort Studies. Frontiers in Nutrition, 2021.",
        url: "https://doi.org/10.3389/fnut.2021.747884",
      },
    ],
  },
  {
    label: "Leafy greens & cruciferous vegetables",
    matchFoodNames: ["Broccoli", "Cauliflower", "Spinach", "Kale", "Cabbage", "Brussels Sprouts"],
    relatedFoodCategory: "Veggies",
    evidenceTier: "Moderate",
    summary:
      "A meta-analysis of prospective cohorts covering over 540,000 participants found roughly 16% lower cardiovascular disease incidence comparing the highest to lowest intake of green leafy and cruciferous vegetables. This is observational cohort evidence with a plausible mechanism, not randomized-trial proof of a causal effect.",
    mechanismOrFinding:
      "High in dietary nitrates, fiber, glucosinolates (crucifers), and antioxidants; cohort meta-analysis shows RR 0.84 (95% CI 0.75–0.94) for high vs. low intake.",
    sources: [
      {
        citation: "Pollock RL. The effect of green leafy and cruciferous vegetable intake on the incidence of cardiovascular disease: A meta-analysis. JRSM Cardiovascular Disease, 2016;5.",
        url: "https://doi.org/10.1177/2048004016661435",
      },
    ],
  },
  {
    label: "Legumes",
    matchFoodNames: ["Beans", "Chickpeas", "Lentils"],
    relatedFoodCategory: "Legumes",
    evidenceTier: "Limited",
    summary:
      "A 2023 systematic review of 47 studies found randomized trials show legumes modestly improve cholesterol and fasting glucose, but the same review found no significant association between legume intake and actual cardiovascular disease or type-2-diabetes incidence in cohort studies. The authors rated the evidence for legumes and hard disease outcomes as limited, despite favorable short-term biomarker changes — still a nutrient-dense, high-fiber, high-protein food group on its own terms.",
    mechanismOrFinding:
      "High soluble fiber, plant protein, folate, magnesium, low glycemic index; RCTs show LDL-C and fasting-glucose reductions, but cohort studies show a null association with CVD/T2D incidence.",
    sources: [
      {
        citation: "Thorisdottir B, Arnesen EK, Bärebring L, et al. Legume consumption in adults and risk of cardiovascular disease and type 2 diabetes: a systematic review and meta-analysis. Food & Nutrition Research, 2023;67.",
        url: "https://doi.org/10.29219/fnr.v67.9541",
      },
    ],
  },
  {
    label: "Nuts & seeds",
    matchFoodNames: [
      "Almonds",
      "Chia",
      "Flaxseeds",
      "Hazelnut butter",
      "Hazelnut paste",
      "Hemp seeds",
      "Peanut butter",
      "Sesame seeds",
      "Tahini",
      "Walnuts",
    ],
    relatedFoodCategory: "Nuts & Seeds",
    evidenceTier: "Moderate",
    summary:
      "A pooled analysis of three large long-running cohorts found people eating nuts five or more times a week had roughly 14% lower cardiovascular disease and 20% lower coronary heart disease risk than non-consumers, and RCT meta-analyses show nut consumption lowers total and LDL cholesterol. Consistent cohort associations plus supportive short-term biomarker trials, but not yet confirmed by long-term hard-outcome RCTs of nuts specifically.",
    mechanismOrFinding:
      "Source of unsaturated fats, fiber, plant sterols, and magnesium; cohort HR 0.86 for CVD and 0.80 for CHD (top vs. bottom nut intake); RCTs show reduced total/LDL cholesterol.",
    sources: [
      {
        citation: "Guasch-Ferré M, Liu X, Malik VS, et al. Nut Consumption and Risk of Cardiovascular Disease. Journal of the American College of Cardiology, 2017;70(20):2519–2532.",
        url: "https://doi.org/10.1016/j.jacc.2017.09.035",
      },
    ],
  },
  {
    label: "Fatty fish / omega-3 sources",
    matchFoodNames: ["Fish", "Salmon", "Tuna"],
    relatedFoodCategory: "Meat & Fish",
    evidenceTier: "Moderate",
    summary:
      "A meta-analysis of 25 prospective cohorts (over 2 million participants) found higher fish and marine omega-3 intake was associated with modestly lower cardiovascular mortality, and the American Heart Association endorses seafood omega-3 intake for cardiovascular risk reduction. Large RCTs of isolated omega-3 supplements have shown mixed, often null results on hard outcomes — the evidence is notably stronger for whole-food fish intake than for supplementation, which is why this stays food-based rather than a supplement suggestion.",
    mechanismOrFinding:
      "Marine long-chain omega-3s (EPA/DHA) lower triglycerides; cohort RR ~0.91 (fish intake) and ~0.87 (marine omega-3 intake) for cardiovascular mortality, highest vs. lowest intake.",
    sources: [
      {
        citation: "Jiang L, Wang K, Lo K, et al. Intake of Fish and Marine n-3 Polyunsaturated Fatty Acids and Risk of Cardiovascular Disease Mortality: A Meta-Analysis of Prospective Cohort Studies. Nutrients, 2021;13(7):2342.",
        url: "https://doi.org/10.3390/nu13072342",
      },
      {
        citation: "Rimm EB, Appel LJ, Chiuve SE, et al. Seafood Long-Chain n-3 Polyunsaturated Fatty Acids and Cardiovascular Disease: A Science Advisory From the American Heart Association. Circulation, 2018;138(1):e35–e47.",
        url: "https://doi.org/10.1161/CIR.0000000000000574",
      },
    ],
  },
  {
    label: "Whole grains",
    matchFoodNames: ["Oats", "Buckwheat", "Bulgur", "Spelt", "Popped millet"],
    relatedFoodCategory: "Grains",
    evidenceTier: "Moderate",
    summary:
      "A dose-response meta-analysis of prospective cohorts (roughly 700,000 participants) found each 90g/day increment of whole-grain intake was linked to about 20% lower cardiovascular disease and all-cause mortality risk. Large, consistent, dose-responsive observational evidence aligned with major dietary guidelines, though not confirmed by long-term randomized trials on hard outcomes (impractical for whole-food comparisons).",
    mechanismOrFinding:
      "Fiber, B vitamins, minerals, and phytochemicals retained in the intact grain; cohort meta-analysis shows RR 0.78 (CVD) and 0.83 (all-cause mortality) per 90g/day increment.",
    sources: [
      {
        citation: "Aune D, Keum N, Giovannucci E, et al. Whole grain consumption and risk of cardiovascular disease, cancer, and all cause and cause specific mortality: systematic review and dose-response meta-analysis of prospective studies. BMJ, 2016;353:i2716.",
        url: "https://doi.org/10.1136/bmj.i2716",
      },
    ],
  },
];
