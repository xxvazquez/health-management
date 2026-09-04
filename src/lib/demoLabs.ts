import type { LabMarker, LabPanel } from "@/lib/supabase/labs";

/** Example lab-results data for the Medical → Results tab when signed out —
 * interactive, in-memory only, nothing saved. */
const DAY = 24 * 60 * 60 * 1000;
const dateOnly = (msOffset: number) => new Date(Date.now() + msOffset).toISOString().slice(0, 10);

export function buildDemoLabPanels(): LabPanel[] {
  return [
    { id: "demo-lab-panel-thyroid", name: "Thyroid", sortOrder: 0 },
    { id: "demo-lab-panel-iron", name: "Iron studies", sortOrder: 1 },
    { id: "demo-lab-panel-cbc", name: "Blood count", sortOrder: 2 },
  ];
}

export function buildDemoLabMarkers(): LabMarker[] {
  return [
    {
      id: "demo-lab-tsh",
      panelId: "demo-lab-panel-thyroid",
      name: "TSH",
      unit: "mIU/L",
      refLow: 0.4,
      refHigh: 4,
      sortOrder: 0,
      results: [
        { id: "demo-lab-tsh-1", markerId: "demo-lab-tsh", measuredOn: dateOnly(-320 * DAY), value: 5.8, lab: "Synevo", note: null },
        { id: "demo-lab-tsh-2", markerId: "demo-lab-tsh", measuredOn: dateOnly(-180 * DAY), value: 3.9, lab: "Synevo", note: "After 6 weeks on levothyroxine." },
        { id: "demo-lab-tsh-3", markerId: "demo-lab-tsh", measuredOn: dateOnly(-30 * DAY), value: 2.1, lab: "Synevo", note: null },
      ],
    },
    {
      id: "demo-lab-ft4",
      panelId: "demo-lab-panel-thyroid",
      name: "FT4",
      unit: "pmol/L",
      refLow: 12,
      refHigh: 22,
      sortOrder: 1,
      results: [
        { id: "demo-lab-ft4-1", markerId: "demo-lab-ft4", measuredOn: dateOnly(-180 * DAY), value: 13.2, lab: "Synevo", note: null },
        { id: "demo-lab-ft4-2", markerId: "demo-lab-ft4", measuredOn: dateOnly(-30 * DAY), value: 15.6, lab: "Synevo", note: null },
      ],
    },
    {
      id: "demo-lab-ferritin",
      panelId: "demo-lab-panel-iron",
      name: "Ferritin",
      unit: "ng/mL",
      refLow: 30,
      refHigh: 200,
      sortOrder: 0,
      results: [
        { id: "demo-lab-ferritin-1", markerId: "demo-lab-ferritin", measuredOn: dateOnly(-250 * DAY), value: 14, lab: "Diagnostyka", note: "Started iron supplement." },
        { id: "demo-lab-ferritin-2", markerId: "demo-lab-ferritin", measuredOn: dateOnly(-90 * DAY), value: 28, lab: "Diagnostyka", note: null },
        { id: "demo-lab-ferritin-3", markerId: "demo-lab-ferritin", measuredOn: dateOnly(-14 * DAY), value: 41, lab: "Diagnostyka", note: null },
      ],
    },
    {
      id: "demo-lab-hgb",
      panelId: "demo-lab-panel-cbc",
      name: "Hemoglobin (HGB)",
      unit: "g/dL",
      refLow: 12,
      refHigh: 16,
      sortOrder: 0,
      results: [
        { id: "demo-lab-hgb-1", markerId: "demo-lab-hgb", measuredOn: dateOnly(-250 * DAY), value: 11.4, lab: "Diagnostyka", note: null },
        { id: "demo-lab-hgb-2", markerId: "demo-lab-hgb", measuredOn: dateOnly(-90 * DAY), value: 12.1, lab: "Diagnostyka", note: null },
        { id: "demo-lab-hgb-3", markerId: "demo-lab-hgb", measuredOn: dateOnly(-14 * DAY), value: 13.0, lab: "Diagnostyka", note: null },
      ],
    },
    {
      id: "demo-lab-crp",
      panelId: "demo-lab-panel-cbc",
      name: "CRP",
      unit: "mg/L",
      refLow: 0,
      refHigh: 5,
      sortOrder: 1,
      results: [
        { id: "demo-lab-crp-1", markerId: "demo-lab-crp", measuredOn: dateOnly(-250 * DAY), value: 2.1, lab: "Diagnostyka", note: null },
        { id: "demo-lab-crp-2", markerId: "demo-lab-crp", measuredOn: dateOnly(-14 * DAY), value: 1.4, lab: "Diagnostyka", note: null },
      ],
    },
    {
      id: "demo-lab-vitd",
      panelId: null,
      name: "Vitamin D (25-OH)",
      unit: "ng/mL",
      refLow: 30,
      refHigh: 50,
      sortOrder: 0,
      results: [
        { id: "demo-lab-vitd-1", markerId: "demo-lab-vitd", measuredOn: dateOnly(-120 * DAY), value: 22, lab: "Diagnostyka", note: null },
        { id: "demo-lab-vitd-2", markerId: "demo-lab-vitd", measuredOn: dateOnly(-14 * DAY), value: 38, lab: "Diagnostyka", note: null },
      ],
    },
  ];
}
