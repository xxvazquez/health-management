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
  evidenceType: EvidenceType;
  publicationYear: number | null;
  pubmedId: string | null;
  doi: string | null;
  url: string | null;
  limitations: string;
  /** When this record was last checked against its source. */
  reviewedDate: string;
}

const REVIEWED = "2026-08-21";

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
    evidenceType: "umbrella-review",
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
      "Higher habitual intake of cruciferous vegetables (broccoli, cabbage, kale, cauliflower) is associated with reduced all-cause mortality and reduced risk of several cancers.",
    explanation:
      "Cruciferous vegetables contain glucosinolates, which break down into isothiocyanates such as sulforaphane — compounds with anti-inflammatory effects in lab and human studies. An umbrella review pooling 41 systematic reviews across 303 observational studies found consistent inverse associations with mortality and several cancers.",
    foodGroup: "cruciferous",
    strength: "Moderate",
    evidenceType: "umbrella-review",
    publicationYear: 2022,
    pubmedId: "35352732",
    doi: "10.1039/d1fo03094a",
    url: "https://pubmed.ncbi.nlm.nih.gov/35352732/",
    limitations:
      "All underlying data are observational; effect sizes vary considerably by cancer type and individual study quality within the umbrella review, so causal attribution to this food group specifically is uncertain.",
    reviewedDate: REVIEWED,
  },
  other_vegetables_evidence: {
    id: "other_vegetables_evidence",
    topic: "Vegetables (general)",
    claim:
      "Each 200 g/day increment in vegetable intake is associated with reduced risk of coronary heart disease, stroke, and all-cause mortality, with benefits continuing up to roughly 800 g/day.",
    explanation:
      "Drawn from the largest dose-response meta-analysis of prospective studies on fruit and vegetable intake, which analyzed vegetables both combined with fruit and separately. Vegetables are low-calorie, fiber- and micronutrient-dense, and higher intake is consistently linked to lower chronic-disease rates.",
    foodGroup: "other_vegetables",
    strength: "Moderate",
    evidenceType: "meta-analysis",
    publicationYear: 2017,
    pubmedId: "28338764",
    doi: "10.1093/ije/dyw319",
    url: "https://pubmed.ncbi.nlm.nih.gov/28338764/",
    limitations:
      "Observational cohort evidence only. This source covers vegetables broadly rather than isolating non-leafy, non-cruciferous vegetables specifically, so the claim is a reasonable proxy for this category rather than a category-specific finding.",
    reviewedDate: REVIEWED,
  },
  berries_evidence: {
    id: "berries_evidence",
    topic: "Berries",
    claim:
      "Higher intake of anthocyanin-rich berries is associated with lower cardiovascular disease incidence and roughly 15% lower type 2 diabetes risk (highest vs. lowest intake).",
    explanation:
      "Berries are a major dietary source of anthocyanins, antioxidant pigment compounds. A combined analysis of 44 randomized trials and 15 prospective cohorts found anthocyanin/berry intake improved blood-lipid markers and was linked to lower cardiovascular risk; a separate cohort meta-analysis found a dose-response reduction in type 2 diabetes risk.",
    foodGroup: "berries",
    strength: "Moderate",
    evidenceType: "meta-analysis",
    publicationYear: 2021,
    pubmedId: "34977111",
    doi: "10.3389/fnut.2021.747884",
    url: "https://pubmed.ncbi.nlm.nih.gov/34977111/",
    limitations:
      "The trial evidence mostly measures short-term surrogate markers (lipids, blood pressure) rather than hard clinical outcomes; the hard-outcome cohort evidence is observational and subject to confounding.",
    reviewedDate: REVIEWED,
  },
  other_fruit_evidence: {
    id: "other_fruit_evidence",
    topic: "Fruit",
    claim:
      "Each additional 200 g/day of whole fruit is associated with a 13% lower risk of cardiovascular disease and a 15% lower risk of all-cause mortality.",
    explanation:
      "A dose-response meta-analysis of 95 prospective studies analyzed fruit intake separately from vegetables and found meaningfully lower rates of heart disease, stroke, and all-cause death, with benefits continuing up to roughly 800 g/day. A separate diabetes-focused meta-analysis found a more modest, non-linear relationship.",
    foodGroup: "other_fruit",
    strength: "Strong",
    evidenceType: "meta-analysis",
    publicationYear: 2017,
    pubmedId: "28338764",
    doi: "10.1093/ije/dyw319",
    url: "https://pubmed.ncbi.nlm.nih.gov/28338764/",
    limitations:
      "Observational design cannot establish causation. The diabetes-specific finding is a weaker, near-threshold association with a non-linear dose-response — more fruit isn't necessarily better at higher intakes. Fruit juice was explicitly excluded from these whole-fruit analyses.",
    reviewedDate: REVIEWED,
  },
  legumes_evidence: {
    id: "legumes_evidence",
    topic: "Legumes",
    claim:
      "Higher legume intake is associated with a modest reduction in cardiovascular and coronary heart disease risk in pooled observational data, but the broader evidence for legumes and type 2 diabetes prevention is limited and mixed.",
    explanation:
      "A 2022 meta-analysis of 26 observational studies found legume eaters had modestly lower cardiovascular disease rates, plateauing around 400 g/week. A more comprehensive 2023 systematic review found the cohort evidence for legumes and CVD/diabetes prevention specifically too limited for a firm conclusion, though short trials showed legumes improving blood-sugar markers.",
    foodGroup: "legumes",
    strength: "Mixed",
    evidenceType: "meta-analysis",
    publicationYear: 2022,
    pubmedId: "36411221",
    doi: "10.1016/j.numecd.2022.10.006",
    url: "https://pubmed.ncbi.nlm.nih.gov/36411221/",
    limitations:
      "The CVD-risk-reduction finding comes from observational data with unresolved confounding. A separate, larger 2020 meta-analysis (PMID 31915830) found total legume intake was not significantly associated with lower type 2 diabetes risk — only soy-specific components showed a significant association — so the diabetes-prevention case for legumes generally is weaker than for CVD.",
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
    evidenceType: "meta-analysis",
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
      "Each 28 g/day (about a small handful) increase in nut intake is associated with a 21% lower risk of coronary heart disease and a 22% lower risk of all-cause mortality.",
    explanation:
      "Pooling 20 prospective cohort studies, higher nut intake (tree nuts and/or peanuts) was consistently linked to lower cardiovascular disease, cancer, and cause-specific mortality, with the protective association strengthening up to roughly a handful a day before leveling off.",
    foodGroup: "nuts",
    strength: "Strong",
    evidenceType: "meta-analysis",
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
    evidenceType: "meta-analysis",
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
    strength: "Strong",
    evidenceType: "meta-analysis",
    publicationYear: 2022,
    pubmedId: "35108375",
    doi: "10.1093/advances/nmac006",
    url: "https://pubmed.ncbi.nlm.nih.gov/35108375/",
    limitations:
      "Observational cohort data — confounding by overall diet quality or socioeconomic factors can't be excluded, and self-reported fish intake is subject to measurement error. The total-mortality effect size is modest (3% relative reduction) even though statistically significant.",
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
    evidenceType: "systematic-review",
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
