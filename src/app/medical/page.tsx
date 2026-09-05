"use client";

import { useEffect, useState } from "react";
import { useDoctors } from "@/lib/useDoctors";
import { TAB_ICON } from "@/components/tabIcons";
import { AppointmentsTab } from "@/components/doctors/AppointmentsTab";
import { DoctorsTab } from "@/components/doctors/DoctorsTab";
import { SpecialtiesTab } from "@/components/doctors/SpecialtiesTab";
import { FollowUpsTab } from "@/components/doctors/FollowUpsTab";
import { CareLogTab } from "@/components/doctors/CareLogTab";
import { ResultsTab } from "@/components/doctors/ResultsTab";
import { VitalsTab } from "@/components/doctors/VitalsTab";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { TabRail } from "@/components/ui/TabRail";
import { DemoNotice } from "@/components/ui/DemoNotice";

const APPOINTMENTS_ACCENT = "var(--series-2)";
const DOCTORS_ACCENT = "var(--series-1)";
const SPECIALTIES_ACCENT = "var(--series-3)";
const FOLLOWUPS_ACCENT = "var(--series-berry)";
const CARELOG_ACCENT = "var(--series-indigo)";
const RESULTS_ACCENT = "var(--series-6)";
const VITALS_ACCENT = "var(--series-magenta)";

type MedicalTabId = "appointments" | "carelog" | "results" | "vitals" | "doctors" | "specialties" | "followups";
const TABS: { id: MedicalTabId; label: string; accent: string }[] = [
  { id: "appointments", label: "Appointments", accent: APPOINTMENTS_ACCENT },
  { id: "carelog", label: "Care log", accent: CARELOG_ACCENT },
  { id: "results", label: "Results", accent: RESULTS_ACCENT },
  { id: "vitals", label: "Vitals", accent: VITALS_ACCENT },
  { id: "doctors", label: "Doctors", accent: DOCTORS_ACCENT },
  { id: "specialties", label: "Specialties", accent: SPECIALTIES_ACCENT },
  { id: "followups", label: "Follow-ups", accent: FOLLOWUPS_ACCENT },
];

// Historical key — the page was "Doctors" before it became "Medical"; kept
// so the rename doesn't reset everyone's last-open tab.
const TAB_STORAGE_KEY = "lauva-doctors-tab";

function isMedicalTab(v: string): v is MedicalTabId {
  return TABS.some((t) => t.id === v);
}

/** The Medical page — everything about doctor visits and results in one
 * place: appointments already attended, a dated care Log, blood/lab
 * Results, the reusable doctors and specialties behind them, and
 * follow-ups. Direct-to-Supabase, like the Personal page. */
export default function MedicalPage() {
  const api = useDoctors();
  const [tab, setTab] = useState<MedicalTabId>("appointments");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const hash = window.location.hash.replace("#", "");
    if (isMedicalTab(hash)) {
      setTab(hash);
      return;
    }
    try {
      const saved = localStorage.getItem(TAB_STORAGE_KEY);
      if (saved && isMedicalTab(saved)) setTab(saved);
    } catch {
      // Storage blocked — stay on the default.
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    const fromHash = () => {
      const id = window.location.hash.replace("#", "");
      if (isMedicalTab(id)) setTab(id);
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
          {active.label}
        </h1>
      </div>

      <TabRail
        items={TABS.map((t) => ({ ...t, icon: TAB_ICON[t.id] }))}
        activeId={tab}
        onSelect={selectTab}
        iconOnly
      />

      {api.isDemo && <DemoNotice />}

      {api.error ? (
        <p className="py-10 text-center text-sm" style={{ color: "var(--status-critical)" }}>
          Couldn&apos;t load your doctors — try again in a moment.
        </p>
      ) : api.loading ? (
        <ListSkeleton />
      ) : (
        <>
          {tab === "appointments" && <AppointmentsTab api={api} accent={APPOINTMENTS_ACCENT} />}
          {tab === "carelog" && <CareLogTab api={api} accent={CARELOG_ACCENT} />}
          {tab === "results" && <ResultsTab accent={RESULTS_ACCENT} />}
          {tab === "vitals" && <VitalsTab accent={VITALS_ACCENT} />}
          {tab === "doctors" && <DoctorsTab api={api} accent={DOCTORS_ACCENT} />}
          {tab === "specialties" && <SpecialtiesTab api={api} accent={SPECIALTIES_ACCENT} />}
          {tab === "followups" && <FollowUpsTab api={api} accent={FOLLOWUPS_ACCENT} />}
        </>
      )}
    </div>
  );
}
