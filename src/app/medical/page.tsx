"use client";

import { useEffect, useState } from "react";
import { useDoctors } from "@/lib/useDoctors";
import { TAB_ICON } from "@/components/tabIcons";
import { VisitsTab } from "@/components/doctors/VisitsTab";
import { DoctorsTab } from "@/components/doctors/DoctorsTab";
import { ResultsTab } from "@/components/doctors/ResultsTab";
import { VitalsTab } from "@/components/doctors/VitalsTab";
import { ErrorState } from "@/components/ui/EmptyState";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { TabRail } from "@/components/ui/TabRail";
import { DemoNotice } from "@/components/ui/DemoNotice";

const VISITS_ACCENT = "var(--series-2)";
const RESULTS_ACCENT = "var(--series-6)";
const VITALS_ACCENT = "var(--series-magenta)";
const DOCTORS_ACCENT = "var(--series-1)";

type MedicalTabId = "visits" | "results" | "vitals" | "doctors";
const TABS: { id: MedicalTabId; label: string; accent: string }[] = [
  { id: "visits", label: "Visits", accent: VISITS_ACCENT },
  { id: "results", label: "Results", accent: RESULTS_ACCENT },
  { id: "vitals", label: "Vitals", accent: VITALS_ACCENT },
  { id: "doctors", label: "Doctors", accent: DOCTORS_ACCENT },
];

// Historical key — the page was "Doctors" before it became "Medical"; kept
// so the rename doesn't reset everyone's last-open tab.
const TAB_STORAGE_KEY = "lauva-doctors-tab";

// Old tab ids (Appointments / Care log / Follow-ups / Specialties) all
// land on Visits now — the two-section spine that absorbed them.
const LEGACY_TAB: Record<string, MedicalTabId> = {
  appointments: "visits",
  carelog: "visits",
  followups: "visits",
  specialties: "visits",
};

function resolveTab(v: string): MedicalTabId | null {
  if (TABS.some((t) => t.id === v)) return v as MedicalTabId;
  return LEGACY_TAB[v] ?? null;
}

/** The Health page — everything about doctor visits and results: Visits
 * (upcoming prep + past appointments), blood/lab Results, self-measured
 * Vitals, and the reusable Doctors behind it all. Direct-to-Supabase. */
export default function MedicalPage() {
  const api = useDoctors();
  const [tab, setTab] = useState<MedicalTabId>("visits");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const fromHash = resolveTab(window.location.hash.replace("#", ""));
    if (fromHash) {
      setTab(fromHash);
      return;
    }
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      const fromSaved = saved ? resolveTab(saved) : null;
      if (fromSaved) setTab(fromSaved);
    } catch {
      // Storage blocked — stay on the default.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const id = resolveTab(window.location.hash.replace("#", ""));
      if (id) setTab(id);
    };
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  function selectTab(id: MedicalTabId) {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {
      // Storage blocked — the tab still switches for this session.
    }
  }

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex flex-col gap-5">
      <div className="border-l-[3px] pl-2.5" style={{ borderColor: active.accent }}>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Health
        </h1>
      </div>

      <TabRail items={TABS.map((t) => ({ ...t, icon: TAB_ICON[t.id] }))} activeId={tab} onSelect={selectTab} />

      {api.isDemo && <DemoNotice />}

      {api.error ? (
        <ErrorState what="your doctors" />
      ) : api.loading ? (
        <ListSkeleton />
      ) : (
        <>
          {tab === "visits" && <VisitsTab api={api} accent={VISITS_ACCENT} />}
          {tab === "results" && <ResultsTab accent={RESULTS_ACCENT} />}
          {tab === "vitals" && <VitalsTab accent={VITALS_ACCENT} />}
          {tab === "doctors" && <DoctorsTab api={api} accent={DOCTORS_ACCENT} />}
        </>
      )}
    </div>
  );
}
