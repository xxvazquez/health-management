import type { NutritionGroupId } from "@/taxonomy/nutritionGroups";

/**
 * The citation layer behind the Food page's "Why this is suggested" links.
 * Deliberately separate from `nutritionEvidence.ts` (the lightweight
 * tier/weight/target table the scoring engine actually reads) — that file
 * drives ranking, this file is what a user sees if they choose to look.
 * Nothing here is rendered anywhere in the normal Food Analytics UI; it
 * only surfaces inside the Nutrition Evidence dialog.
 *
 * Every non-null field below was verified against the actual source
 * (PubMed / Europe PMC metadata, or the paper's own abstract/full text) —
 * none are recalled from memory and typed in unchecked. Where a field
 * couldn't be verified, it's left null rather than guessed; where the
 * underlying evidence itself is mixed or limited, the claim says so
 * (`strength: "Mixed" | "Limited"`) instead of being upgraded to sound
 * more definitive than the source supports.
 */

export type EvidenceStrength = "Strong" | "Moderate" | "Limited" | "Mixed";
export type EvidenceType = "systematic-review" | "meta-analysis" | "umbrella-review" | "cohort" | "rct" | "guideline";

export interface EvidenceRecord {
  id: string;
  topic: string;
  claim: string;
  explanation: string;
  foodGroup: NutritionGroupId | null;
  strength: EvidenceStrength;
  /** Usually one value. More than one when a single cited source itself pools
   * genuinely different study designs (e.g. an RCT arm and a cohort arm) —
   * not used to double-count a synthesis method against the studies it pooled. */
  evidenceTypes: EvidenceType[];
  publicationYear: number | null;
  pubmedId: string | null;
  doi: string | null;
  url: string | null;
  limitations: string;
  /** When this record was last checked against its source. */
  reviewedDate: string;
}

const REVIEWED = "2026-08-21";
// Records added when the vegetable/fruit taxonomy was split into
// carotenoid / allium / citrus subgroups.
const REVIEWED_SUBGROUPS = "2026-08-31";

export const EVIDENCE_RECORDS: Record<string, EvidenceRecord> = {
  leafy_greens_evidence: {
    id: "leafy_greens_evidence",
    topic: "Leafy greens",
    claim:
      "Each 100 g/day increment of green leafy vegetable intake is associated with roughly 25% lower risk of all-cause mortality, coronary heart disease, and stroke.",
    explanation:
      "Green leafy vegetables are rich in nitrates, lutein, vitamin K, and other compounds that may improve vascular function. Pooled cohort data show a consistent, dose-dependent inverse relationship with cardiovascular and mortality outcomes.",
    foodGroup: "leafy_greens",
    strength: "Moderate",
    evidenceTypes: ["umbrella-review"],
    publicationYear: 2021,
    pubmedId: "34034049",
    doi: "10.1016/j.foodchem.2021.130145",
    url: "https://pubmed.ncbi.nlm.nih.gov/34034049/",
    limitations:
      "Underlying evidence is entirely observational, so residual confounding by overall diet quality can't be excluded; the effect size is a pooled extrapolation, not a randomized causal estimate.",
    reviewedDate: REVIEWED,
  },
  cruciferous_evidence: {
    id: "cruciferous_evidence",
    topic: "Cruciferous vegetables",
    claim:
      "Higher habitual intake of cruciferous vegetables (broccoli, cabbage, kale, cauliflower) shows suggestive associations with lower all-cause mortality and lower risk of gastric, lung, and endometrial cancer specifically; the same review rated its evidence for most other cancers examined as only weak.",
    explanation:
      "Cruciferous vegetables contain glucosinolates, which break down into isothiocyanates such as sulforaphane — compounds with anti-inflammatory effects in lab and human studies. An umbrella review pooling 41 systematic reviews and meta-analyses of 303 observational studies (13.4 million participants) graded its own evidence as 'suggestive' for gastric cancer, lung cancer, endometrial cancer, and all-cause mortality, and as 'weak' for the other 16 associations it examined — including total cancer risk, colorectal cancer, and breast, prostate, ovarian, bladder and renal cancers.",
    foodGroup: "cruciferous",
    strength: "Mixed",
    evidenceTypes: ["umbrella-review"],
    publicationYear: 2022,
    pubmedId: "35352732",
    doi: "10.1039/d1fo03094a",
    url: "https://pubmed.ncbi.nlm.nih.gov/35352732/",
    limitations:
      "All 303 underlying studies are observational. Even the review's best-graded associations reach only 'suggestive' — a below-top-tier grade in umbrella-review certainty schemes, short of 'convincing' — and the review itself states substantial uncertainty remains for many of the outcomes it examined. Causal attribution to cruciferous vegetables specifically can't be established from this evidence, and effect sizes vary considerably by cancer type.",
    reviewedDate: REVIEWED,
  },
  other_vegetables_evidence: {
    id: "other_vegetables_evidence",
    topic: "Vegetables (general)",
    claim:
      "Each 200 g/day increment in vegetable intake alone is associated with roughly 16% lower coronary heart disease risk, 13% lower stroke risk, and 13% lower all-cause mortality, with benefits continuing up to roughly 800 g/day.",
    explanation:
      "Drawn from a dose-response meta-analysis of 95 prospective cohort studies on fruit and vegetable intake, which analyzed vegetables as their own exposure, separate from fruit. Vegetables are low-calorie, fiber- and micronutrient-dense, and higher intake is consistently linked to lower chronic-disease rates.",
    foodGroup: "other_vegetables",
    strength: "Moderate",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2017,
    pubmedId: "28338764",
    doi: "10.1093/ije/dyw319",
    url: "https://pubmed.ncbi.nlm.nih.gov/28338764/",
    limitations:
      "Observational cohort evidence only — residual confounding by overall diet quality or other lifestyle factors can't be excluded, and the relative-risk estimate is a pooled extrapolation rather than a randomized causal estimate. This category (non-leafy, non-cruciferous vegetables) isn't isolated in the source; the estimate is for vegetables broadly.",
    reviewedDate: REVIEWED,
  },
  berries_evidence: {
    id: "berries_evidence",
    topic: "Berries",
    claim:
      "Higher intake of anthocyanin-rich berries is associated with lower cardiovascular disease incidence and roughly 15% lower type 2 diabetes risk (highest vs. lowest intake).",
    explanation:
      "Berries are a major dietary source of anthocyanins, antioxidant pigment compounds. A 2021 meta-analysis combining 44 randomized trials (blood-lipid markers) and 15 prospective cohort studies (cardiovascular events) found anthocyanin/berry intake improved LDL, triglycerides and HDL in trials, and was linked to lower coronary heart disease and cardiovascular disease incidence in cohorts. A separate 2016 meta-analysis of 8 cohort studies (PMID 27530472) found anthocyanin intake associated with 15% lower type 2 diabetes risk (RR 0.85, 95% CI 0.80-0.91, highest vs. lowest intake), with a significant dose-response relationship.",
    foodGroup: "berries",
    strength: "Moderate",
    evidenceTypes: ["rct", "cohort"],
    publicationYear: 2021,
    pubmedId: "34977111",
    doi: "10.3389/fnut.2021.747884",
    url: "https://pubmed.ncbi.nlm.nih.gov/34977111/",
    limitations:
      "The trial evidence measures short-term surrogate markers (lipids) rather than hard clinical outcomes; the hard-outcome cohort evidence for both CVD and diabetes is observational and subject to confounding. The total-CVD-incidence cohort estimate has a wide confidence interval (RR 0.73, 95% CI 0.55-0.97).",
    reviewedDate: REVIEWED,
  },
  other_fruit_evidence: {
    id: "other_fruit_evidence",
    topic: "Fruit",
    claim:
      "Each additional 200 g/day of whole fruit is associated with a 13% lower risk of cardiovascular disease and a 15% lower risk of all-cause mortality.",
    explanation:
      "A dose-response meta-analysis of 95 prospective cohort studies analyzed fruit intake as its own exposure, separate from vegetables, and found meaningfully lower rates of heart disease, stroke, and all-cause death, with benefits continuing up to roughly 800 g/day.",
    foodGroup: "other_fruit",
    strength: "Strong",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2017,
    pubmedId: "28338764",
    doi: "10.1093/ije/dyw319",
    url: "https://pubmed.ncbi.nlm.nih.gov/28338764/",
    limitations:
      "Observational design cannot establish causation, and the estimate is a pooled extrapolation rather than a randomized causal effect. Fruit juice was analyzed as a separate category and excluded from these whole-fruit estimates.",
    reviewedDate: REVIEWED,
  },
  red_orange_veg_evidence: {
    id: "red_orange_veg_evidence",
    topic: "Red & orange vegetables",
    claim:
      "Higher lycopene intake or blood level — supplied mainly by tomatoes and other red/orange produce — is associated with roughly 14% lower cardiovascular disease risk and 26% lower stroke risk (highest vs. lowest category).",
    explanation:
      "Red and orange vegetables are the main dietary source of carotenoids: β-carotene from carrots, squash and sweet potato, and lycopene from tomatoes. A 2019 systematic review and meta-analysis of epidemiological evidence (28 publications, 25 with quantitative data) found the highest category of lycopene intake or serum concentration associated with lower cardiovascular disease (HR 0.86, 95% CI 0.77–0.95), lower stroke risk (HR 0.74, 95% CI 0.62–0.89), and, for serum lycopene specifically, lower all-cause mortality (HR 0.63, 95% CI 0.49–0.81).",
    foodGroup: "red_orange_veg",
    strength: "Limited",
    evidenceTypes: ["meta-analysis", "cohort"],
    publicationYear: 2019,
    pubmedId: "28799780",
    doi: "10.1080/10408398.2017.1362630",
    url: "https://pubmed.ncbi.nlm.nih.gov/28799780/",
    limitations:
      "The pooled estimate is for lycopene specifically — overwhelmingly from tomatoes — not the whole red/orange group, and it combines dietary-intake studies with serum-biomarker studies. All underlying evidence is observational, so residual confounding by overall diet quality can't be excluded. Randomized β-carotene supplement trials have shown no cardiovascular benefit and, in smokers, increased lung cancer — so this association is not a case for carotenoid supplements.",
    reviewedDate: REVIEWED_SUBGROUPS,
  },
  alliums_evidence: {
    id: "alliums_evidence",
    topic: "Onion-family vegetables",
    claim:
      "High intake of allium vegetables (onion, garlic, leek) is associated with roughly 46% lower gastric cancer risk versus low intake, with a dose-response relationship of about 9% lower risk per 20 g/day.",
    explanation:
      "Allium vegetables are the main dietary source of organosulfur compounds such as allicin. A 2011 meta-analysis in Gastroenterology pooling 19 case-control and 2 cohort studies (543,220 participants) found high allium vegetable intake associated with lower gastric cancer risk (OR 0.54, 95% CI 0.43–0.65), and estimated a per-20 g/day OR of 0.91 (95% CI 0.88–0.94).",
    foodGroup: "alliums",
    strength: "Limited",
    evidenceTypes: ["meta-analysis", "cohort"],
    publicationYear: 2011,
    pubmedId: "21473867",
    doi: "10.1053/j.gastro.2011.03.057",
    url: "https://pubmed.ncbi.nlm.nih.gov/21473867/",
    limitations:
      "19 of the 21 pooled studies are case-control, a design prone to recall and selection bias, and the meta-analysis noted the inverse association held in Asian populations but not consistently in European or US ones. The evidence is for gastric cancer specifically; associations with cardiovascular disease and other cancers are thinner and come largely from concentrated garlic supplements rather than culinary amounts.",
    reviewedDate: REVIEWED_SUBGROUPS,
  },
  citrus_evidence: {
    id: "citrus_evidence",
    topic: "Citrus fruit",
    claim:
      "Higher dietary flavanone intake — citrus fruit is the dominant source — is associated with roughly 15% lower stroke risk, with about an 11% reduction per 50 mg/day.",
    explanation:
      "Citrus fruits (oranges, lemons, grapefruit, mandarins) are the main dietary source of the flavanones hesperidin and naringenin, and a major source of vitamin C. A 2022 meta-analysis of 10 prospective cohort studies (387,076 participants, 9,564 stroke events) found higher flavanone intake associated with lower stroke risk (RR 0.85, 95% CI 0.78–0.93), with a dose-response of RR 0.89 (95% CI 0.84–0.94) per 50 mg/day.",
    foodGroup: "citrus",
    strength: "Limited",
    evidenceTypes: ["meta-analysis", "cohort"],
    publicationYear: 2022,
    pubmedId: "35023220",
    doi: "10.1002/ptr.7376",
    url: "https://pubmed.ncbi.nlm.nih.gov/35023220/",
    limitations:
      "The exposure is total flavanone intake rather than citrus fruit directly, though citrus is its main source; a meaningful share of flavanone intake in these cohorts came from juice, which carries different sugar and fibre. All studies are observational, and the association was specific to stroke — not other cardiovascular endpoints.",
    reviewedDate: REVIEWED_SUBGROUPS,
  },
  legumes_evidence: {
    id: "legumes_evidence",
    topic: "Legumes",
    claim:
      "Higher legume intake is associated with a modest reduction in cardiovascular and coronary heart disease risk in pooled observational data, but the broader evidence for legumes and type 2 diabetes prevention is limited and mixed.",
    explanation:
      "A 2023 meta-analysis of 26 observational studies (21 cohort, 5 case-control) found legume eaters had modestly lower cardiovascular disease rates, plateauing around 400 g/week. A broader 2023 systematic review (Thorisdottir et al., PMID 37288088) pooling 31 cohort studies found the cohort evidence for legumes and CVD/T2D risk was 'suggestive of null associations,' though its 14 short-term RCTs showed legumes improving cholesterol and glycemic markers (fasting glucose, HOMA-IR).",
    foodGroup: "legumes",
    strength: "Mixed",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2023,
    pubmedId: "36411221",
    doi: "10.1016/j.numecd.2022.10.006",
    url: "https://pubmed.ncbi.nlm.nih.gov/36411221/",
    limitations:
      "The CVD-risk-reduction finding comes from observational data with unresolved confounding, and a separate, larger 2023 systematic review of cohort evidence reached a more skeptical 'null association' conclusion for both CVD and T2D — the two sources genuinely disagree, which is why this is rated Mixed rather than Moderate. A separate 2020 meta-analysis (PMID 31915830) also found total legume intake was not significantly associated with lower type 2 diabetes risk — only soy-specific components showed a significant association.",
    reviewedDate: REVIEWED,
  },
  whole_grains_evidence: {
    id: "whole_grains_evidence",
    topic: "Whole grains",
    claim:
      "Each additional 90 g/day of whole grains is associated with 22% lower cardiovascular disease risk, 19% lower coronary heart disease risk, and 17% lower all-cause mortality.",
    explanation:
      "A large pooled analysis of prospective studies found people eating more whole grains (oats, brown rice, whole wheat) had consistently lower rates of heart disease, cancer death, and death from any cause, with the protective association strengthening up to roughly 210-225 g/day before leveling off.",
    foodGroup: "whole_grains",
    strength: "Strong",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2016,
    pubmedId: "27301975",
    doi: "10.1136/bmj.i2716",
    url: "https://pubmed.ncbi.nlm.nih.gov/27301975/",
    limitations:
      "Based entirely on observational cohort data — causation can't be firmly established, and whole-grain intake correlates with broader healthy-diet patterns that could partly explain the association.",
    reviewedDate: REVIEWED,
  },
  nuts_evidence: {
    id: "nuts_evidence",
    topic: "Nuts",
    claim:
      "Each 28 g/day (about a small handful) increase in nut intake is associated with a 29% lower risk of coronary heart disease and a 22% lower risk of all-cause mortality.",
    explanation:
      "Pooling 20 prospective cohort studies, higher nut intake (tree nuts and/or peanuts) was consistently linked to lower cardiovascular disease, cancer, and cause-specific mortality, with the protective association strengthening up to roughly a handful a day before leveling off.",
    foodGroup: "nuts",
    strength: "Strong",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2016,
    pubmedId: "27916000",
    doi: "10.1186/s12916-016-0730-3",
    url: "https://pubmed.ncbi.nlm.nih.gov/27916000/",
    limitations:
      "Observational cohort evidence — could be partly explained by nut-eaters having generally healthier diets. Nut type and preparation (salted, roasted) varied across studies and weren't fully distinguishable in the pooled analysis.",
    reviewedDate: REVIEWED,
  },
  seeds_evidence: {
    id: "seeds_evidence",
    topic: "Seeds",
    claim:
      "A meta-analysis of 18 randomized trials found flaxseed supplementation reduced systolic blood pressure by ~4.8 mmHg and diastolic by ~3.1 mmHg in people with cardiovascular risk factors.",
    explanation:
      "Flaxseed is rich in plant omega-3 (ALA), soluble fiber, and lignans, thought to modestly improve blood-vessel function. This is the seed with by far the strongest trial evidence — a supporting chia-seed trial meta-analysis found a smaller, borderline blood-pressure effect and no significant impact on lipids or blood sugar.",
    foodGroup: "seeds",
    strength: "Moderate",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2025,
    pubmedId: "40365516",
    doi: "10.34172/jcvtr.025.33280",
    url: "https://pubmed.ncbi.nlm.nih.gov/40365516/",
    limitations:
      "This evidence is specific to flaxseed and shouldn't be generalized to \"seeds\" as a category — other seeds (chia, sesame, pumpkin, sunflower) have much thinner and more mixed trial evidence. The trials themselves show substantial heterogeneity in dose, form, and duration.",
    reviewedDate: REVIEWED,
  },
  fatty_fish_evidence: {
    id: "fatty_fish_evidence",
    topic: "Fatty fish",
    claim:
      "A meta-analysis of 19 cohort studies found fatty fish consumption inversely associated with coronary heart disease incidence, CHD mortality, and total mortality — associations not seen for lean fish.",
    explanation:
      "Fatty fish (salmon, mackerel, sardines, herring, trout) are rich in long-chain omega-3s (EPA/DHA), thought to reduce inflammation and arrhythmia risk. This analysis found the cardiovascular benefit often attributed to \"eating fish\" is specifically driven by fatty fish — lean fish showed no significant protective association in the same analysis.",
    foodGroup: "fatty_fish",
    strength: "Moderate",
    evidenceTypes: ["meta-analysis"],
    publicationYear: 2022,
    pubmedId: "35108375",
    doi: "10.1093/advances/nmac006",
    url: "https://pubmed.ncbi.nlm.nih.gov/35108375/",
    limitations:
      "Observational cohort data — confounding by overall diet quality or socioeconomic factors can't be excluded, and self-reported fish intake is subject to measurement error. Effect sizes are modest: CHD mortality's confidence interval (0.70-0.98) sits close to the null, and the total-mortality association, while statistically significant, reflects only a 3% relative reduction (RR 0.97, 95% CI 0.94-0.99).",
    reviewedDate: REVIEWED,
  },
  dietary_diversity_evidence: {
    id: "dietary_diversity_evidence",
    topic: "Dietary diversity and diet quality",
    claim:
      "A 2026 systematic review found diets with greater diversity can vary substantially in overall quality — diversity alone doesn't reliably indicate diet quality or predict health outcomes.",
    explanation:
      "Reviewing diet-quality scores that include diversity as a component, the authors concluded diversity is only one part of diet quality alongside adequacy (getting enough of the nutrients that matter), balance (the right proportions across food groups), and moderation (limiting foods linked to worse outcomes). This is why Lauva's suggestions focus on which specific food groups are missing or underrepresented, not on maximizing how many different ingredients you eat.",
    foodGroup: null,
    strength: "Moderate",
    evidenceTypes: ["systematic-review"],
    publicationYear: 2026,
    pubmedId: "42047829",
    doi: "10.1007/s00394-026-03907-x",
    url: "https://pubmed.ncbi.nlm.nih.gov/42047829/",
    limitations:
      "The review itself notes current evidence is insufficient to determine whether diet-quality scores that include diversity are linked to chronic-disease outcomes, and that heterogeneity in how studies define both diet quality and diversity limits comparability across them.",
    reviewedDate: REVIEWED,
  },
};

export function evidenceRecordById(id: string | null | undefined): EvidenceRecord | null {
  if (!id) return null;
  return EVIDENCE_RECORDS[id] ?? null;
}
