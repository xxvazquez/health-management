"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import { buildPersonalTrends, topCrossDomainFindings } from "@/lib/aggregations/overview";
import { fetchNoteThreads, notesConfigured, type NoteThread } from "@/lib/supabase/notes";
import { getPartnerLink } from "@/lib/supabase/partner";
import { buildDemoThreads } from "@/lib/demoNotes";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { DashboardHeader } from "@/components/analytics/DashboardHeader";
import { PersonalTrendsSection } from "@/components/overview/PersonalTrendsSection";
import { PeriodReviewSection } from "@/components/overview/PeriodReviewSection";

function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The Trends "Overview" tab — the cross-domain read-back that used to sit
 * below the Agenda list: the "what stands out across every domain" summary
 * and a week/month review. Per-domain detail lives on the other tabs, and
 * today's own timeline lives on the Log page; this is the glance back.
 */
export function TrendsOverviewDashboard() {
  const { status, events, workoutLogs, stoolLogs, periodLogs } = useData();
  const { session } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);

  const [noteThreads, setNoteThreads] = useState<NoteThread[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session) {
        setNoteThreads(buildDemoThreads());
        return;
      }
      if (!notesConfigured) return;
      try {
        const link = await getPartnerLink();
        if (!link) {
          setNoteThreads([]);
          return;
        }
        const [inbox, sent] = await Promise.all([fetchNoteThreads("inbox"), fetchNoteThreads("sent")]);
        if (!cancelled) setNoteThreads([...inbox, ...sent]);
      } catch (err) {
        console.error("Trends overview: loading notes failed", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const trends = useMemo(() => buildPersonalTrends(events, workoutLogs, periodLogs, today), [events, workoutLogs, periodLogs, today]);
  const findings = useMemo(() => topCrossDomainFindings(events, stoolLogs, workoutLogs), [events, stoolLogs, workoutLogs]);
  const notesInRange = useCallback(
    (range: DateRange) =>
      noteThreads.filter((t) => {
        const d = localDateOf(t.lastMessageAt);
        return d >= range.start && d <= range.end;
      }).length,
    [noteThreads],
  );

  if (status === "loading") return <PageSkeleton />;
  if (status === "empty") return <EmptyState />;

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader subtitle="What stands out across every domain, and a week or month at a time.">Overview</DashboardHeader>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <PersonalTrendsSection trends={trends} findings={findings} />
        <PeriodReviewSection events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} today={today} notesInRange={notesInRange} />
      </div>
    </div>
  );
}
