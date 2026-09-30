import type { LabMarker, LabPanel } from "@/lib/supabase/labs";

export type LabNameLanguage = "pl" | "en";

/** Polish lab panel and marker names with their English equivalents. Names
 * that read the same in both (TSH, MCV, HDL…) aren't listed. Display only:
 * the stored names are never changed. */
const PL_EN: [string, string][] = [
  // Panels
  ["Morfologia", "CBC"],
  ["CRP i OB", "CRP & ESR"],
  ["Wątrobowe", "Liver"],
  ["Nerkowe", "Kidney"],
  ["Lipidogram", "Lipid panel"],
  ["Cukrzyca", "Diabetes"],
  ["Hormony", "Hormones"],
  ["Witaminy", "Vitamins"],
  ["Żelazo i minerały", "Iron & minerals"],
  ["Enzymy", "Enzymes"],
  ["Koagulologia", "Coagulation"],
  ["Immunologia", "Immunology"],
  ["Infekcje i immunologia", "Infections & immunology"],
  ["Elektrolity", "Electrolytes"],
  ["Tarczyca", "Thyroid"],
  ["Mocz", "Urine"],
  // Blood count
  ["Bazocyty", "Basophils"],
  ["Bazocyty %", "Basophils %"],
  ["Eozynocyty", "Eosinophils"],
  ["Eozynocyty %", "Eosinophils %"],
  ["Erytrocyty (RBC)", "Red blood cells (RBC)"],
  ["Erytrocyty", "Red blood cells"],
  ["Hematokryt (HCT)", "Haematocrit (HCT)"],
  ["Hematokryt", "Haematocrit"],
  ["Hemoglobina (HGB)", "Haemoglobin (HGB)"],
  ["Hemoglobina", "Haemoglobin"],
  ["Leukocyty (WBC)", "White blood cells (WBC)"],
  ["Leukocyty", "White blood cells"],
  ["Limfocyty", "Lymphocytes"],
  ["Limfocyty %", "Lymphocytes %"],
  ["Monocyty", "Monocytes"],
  ["Monocyty %", "Monocytes %"],
  ["Neutrocyty", "Neutrophils"],
  ["Neutrocyty %", "Neutrophils %"],
  ["Niedojrzałe granulocyty (IG)", "Immature granulocytes (IG)"],
  ["Niedojrzałe granulocyty (IG) %", "Immature granulocytes (IG) %"],
  ["Płytki krwi (PLT)", "Platelets (PLT)"],
  ["Płytki krwi", "Platelets"],
  ["Retikulocyty", "Reticulocytes"],
  // Inflammation
  ["OB", "ESR"],
  // Liver, pancreas, muscle
  ["Albumina", "Albumin"],
  ["Amylaza", "Amylase"],
  ["Białko całkowite", "Total protein"],
  ["Bilirubina całkowita", "Total bilirubin"],
  ["Bilirubina bezpośrednia", "Direct bilirubin"],
  ["GGTP", "GGT"],
  ["Lipaza", "Lipase"],
  ["Kinaza fosfokreatynowa", "Creatine kinase"],
  ["Fosfataza alkaliczna", "Alkaline phosphatase"],
  // Kidney
  ["Kreatynina", "Creatinine"],
  ["Kwas moczowy", "Uric acid"],
  ["Mocznik", "Urea"],
  // Lipids
  ["Cholesterol całkowity", "Total cholesterol"],
  ["Cholesterol HDL", "HDL cholesterol"],
  ["Cholesterol LDL", "LDL cholesterol"],
  ["Triglicerydy", "Triglycerides"],
  ["nie-HDL", "Non-HDL"],
  // Glucose
  ["Glukoza", "Glucose"],
  ["Glukoza na czczo", "Fasting glucose"],
  ["Insulina", "Insulin"],
  // Hormones
  ["17-OH Progesteron", "17-OH progesterone"],
  ["Androstendion", "Androstenedione"],
  ["Kortyzol", "Cortisol"],
  ["Parathormon", "Parathyroid hormone (PTH)"],
  ["Progesteron", "Progesterone"],
  ["Prolaktyna", "Prolactin"],
  ["Testosteron", "Testosterone"],
  ["Testosteron wolny", "Free testosterone"],
  ["ATG", "Anti-TG"],
  ["ATPO", "Anti-TPO"],
  // Vitamins
  ["Homocysteina", "Homocysteine"],
  ["Kwas foliowy", "Folate"],
  ["Witamina A", "Vitamin A"],
  ["Witamina B12", "Vitamin B12"],
  ["Witamina B6", "Vitamin B6"],
  ["Witamina C", "Vitamin C"],
  ["Witamina D", "Vitamin D"],
  ["Witamina E", "Vitamin E"],
  // Iron and minerals
  ["Cynk", "Zinc"],
  ["Ferrytyna", "Ferritin"],
  ["Fosfor nieorganiczny", "Phosphate"],
  ["Magnez", "Magnesium"],
  ["Miedź", "Copper"],
  ["Potas", "Potassium"],
  ["Saturacja transferyny", "Transferrin saturation"],
  ["Sód", "Sodium"],
  ["Chlorki", "Chloride"],
  ["Transferyna", "Transferrin"],
  ["Wapń całkowity", "Total calcium"],
  ["Wapń zjonizowany", "Ionised calcium"],
  ["Żelazo", "Iron"],
  ["Selen", "Selenium"],
  // Coagulation
  ["Czynnik VII", "Factor VII"],
  ["Wskaźnik PT", "PT index"],
  ["Fibrynogen", "Fibrinogen"],
  ["D-dimery", "D-dimer"],
  // Immunology and infections
  ["Dopełniacz C3", "Complement C3"],
  ["Dopełniacz C4", "Complement C4"],
  ["IgE całkowite", "Total IgE"],
  ["Borelia IgG", "Borrelia IgG"],
  ["Borelia IgM", "Borrelia IgM"],
];

const key = (name: string) => name.trim().toLocaleLowerCase("pl");
const TO_EN = new Map(PL_EN.map(([pl, en]) => [key(pl), en]));
const TO_PL = new Map(PL_EN.map(([pl, en]) => [key(en), pl]));

/** A panel or marker name in `lang`: the known equivalent, else the name as stored. */
export function labName(name: string, lang: LabNameLanguage): string {
  return (lang === "en" ? TO_EN : TO_PL).get(key(name)) ?? name;
}

/** The same lab data with every panel and marker name shown in `lang`. */
export function localizeLabs<T extends { panels: { data: LabPanel[] }; markers: { data: LabMarker[] } }>(labs: T, lang: LabNameLanguage): T {
  return {
    ...labs,
    panels: { ...labs.panels, data: labs.panels.data.map((p) => ({ ...p, name: labName(p.name, lang) })) },
    markers: { ...labs.markers, data: labs.markers.data.map((m) => ({ ...m, name: labName(m.name, lang) })) },
  };
}
