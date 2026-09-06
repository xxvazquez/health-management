"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { usePersonalReminderBoards } from "@/lib/usePersonalReminderBoards";
import { useHouseholdReminderBoards } from "@/lib/useHouseholdReminderBoards";
import { useDoctors } from "@/lib/useDoctors";
import { usePartnerLinked } from "@/lib/usePartnerLinked";
import {
  addDaysToDate,
  todayLocalISODate,
  type DateRange,
} from "@/lib/aggregations/common";
import { useIsClient } from "@/lib/useIsClient";
import { buildAgenda, type AgendaEntry } from "@/lib/aggregations/agenda";
import {
  buildPersonalTrends,
  topCrossDomainFindings,
} from "@/lib/aggregations/overview";
import {
  fetchNoteThreads,
  notesConfigured,
  type NoteThread,
} from "@/lib/supabase/notes";
import { getPartnerLink } from "@/lib/supabase/partner";
import { buildDemoThreads } from "@/lib/demoNotes";
import { PageHeading } from "@/components/ui/PageHeading";
import { PageShell } from "@/components/ui/PageShell";
import { Card, CardTitle } from "@/components/ui/Card";
import { ListSkeleton } from "@/components/ui/Skeleton";
import { AgendaBoard, AgendaCounts } from "@/components/agenda/AgendaBoard";
import {
  TodaySnapshot,
  type DayNoteSummary,
} from "@/components/overview/TodaySnapshot";
import { PersonalTrendsSection } from "@/components/overview/PersonalTrendsSection";
import { PeriodReviewSection } from "@/components/overview/PeriodReviewSection";
import type { TaskFormValues } from "@/components/reminders/TaskBoard";

function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function noteToDaySummary(t: NoteThread): DayNoteSummary {
  return {
    key: t.id,
    time: new Date(t.lastMessageAt).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }),
    sortKey: t.lastMessageAt,
    label: t.isMine ? "Note sent" : "Note received",
    description: t.subject || t.body.slice(0, 60),
  };
}

/**
 * Agenda — the one "what needs my attention?" surface. Reminders (mine +
 * shared), product expiry, doctor follow-ups and upcoming appointments,
 * interleaved by *when they matter* into Overdue / Today / Tomorrow / Next
 * 7 days / Later / No date. Type, scope and list are filters, never the
 * primary grouping. A "Today so far" glance sits below as secondary.
 */
export default function AgendaPage() {
  const { status, events, workoutLogs, stoolLogs, periodLogs } = useData();
  const { session } = useAuth();
  const partnerLinked = usePartnerLinked();
  const personal = usePersonalReminderBoards();
  const household = useHouseholdReminderBoards();
  const doctors = useDoctors();
  const isClient = useIsClient();
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
        const [inbox, sent] = await Promise.all([
          fetchNoteThreads("inbox"),
          fetchNoteThreads("sent"),
        ]);
        if (!cancelled) setNoteThreads([...inbox, ...sent]);
      } catch (err) {
        console.error("Agenda: loading notes failed", err);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const upcomingAppointments = useMemo(
    () =>
      doctors.specialties.data
        .filter((s) => !s.isArchived && s.nextAppointmentDate)
        .map((s) => ({
          id: s.id,
          label: `${s.name} appointment`,
          date: s.nextAppointmentDate as string,
        })),
    [doctors.specialties.data],
  );

  const entries = useMemo(
    () =>
      buildAgenda(
        {
          personalReminders: personal.tasks.data,
          sharedReminders: household.tasks.data,
          personalExpiry: personal.items.data,
          sharedExpiry: household.items.data,
          followUps: doctors.tasks.data,
          upcomingAppointments,
        },
        { today },
      ),
    [
      personal.tasks.data,
      household.tasks.data,
      personal.items.data,
      household.items.data,
      doctors.tasks.data,
      upcomingAppointments,
      today,
    ],
  );

  const yesterday = useMemo(() => addDaysToDate(today, -1), [today]);
  const todayNotes = useMemo(
    () =>
      noteThreads
        .filter((t) => localDateOf(t.lastMessageAt) === today)
        .map(noteToDaySummary),
    [noteThreads, today],
  );
  const yesterdayNotes = useMemo(
    () =>
      noteThreads
        .filter((t) => localDateOf(t.lastMessageAt) === yesterday)
        .map(noteToDaySummary),
    [noteThreads, yesterday],
  );

  const trends = useMemo(
    () => buildPersonalTrends(events, workoutLogs, periodLogs, today),
    [events, workoutLogs, periodLogs, today],
  );
  const findings = useMemo(
    () => topCrossDomainFindings(events, stoolLogs, workoutLogs),
    [events, stoolLogs, workoutLogs],
  );
  const notesInRange = useCallback(
    (range: DateRange) =>
      noteThreads.filter((t) => {
        const d = localDateOf(t.lastMessageAt);
        return d >= range.start && d <= range.end;
      }).length,
    [noteThreads],
  );

  // --- action dispatch: route each row to its own scope's hook. Plain
  // functions (not memoized) — AgendaBoard isn't a memo component.
  const boardFor = (scope: "mine" | "shared") =>
    scope === "shared" ? household : personal;
  const onCompleteReminder = (e: AgendaEntry) =>
    boardFor(e.scope as "mine" | "shared").tasks.complete(e.reminder!);
  const onUncompleteReminder = (e: AgendaEntry) =>
    boardFor(e.scope as "mine" | "shared").tasks.uncomplete(e.reminder!);
  const onEditReminder = (e: AgendaEntry, v: TaskFormValues) =>
    boardFor(e.scope as "mine" | "shared").tasks.edit(e.reminder!.id, v);
  const onDeleteReminder = (e: AgendaEntry) =>
    boardFor(e.scope as "mine" | "shared").tasks.remove(e.reminder!.id);
  const onCreateReminder = (scope: "mine" | "shared", v: TaskFormValues) =>
    boardFor(scope).tasks.create(v);
  const onEditExpiry = (
    e: AgendaEntry,
    name: string,
    on: string,
    remind: number,
  ) =>
    boardFor(e.scope as "mine" | "shared").items.edit(
      e.expiry!.id,
      name,
      on,
      remind,
    );
  const onDeleteExpiry = (e: AgendaEntry) =>
    boardFor(e.scope as "mine" | "shared").items.remove(e.expiry!.id);
  const onCreateExpiry = (
    scope: "mine" | "shared",
    name: string,
    on: string,
    remind: number,
  ) => boardFor(scope).items.create(name, on, remind);

  const loading =
    !personal.isDemo &&
    (personal.tasks.loading ||
      household.tasks.loading ||
      personal.items.loading ||
      household.items.loading);
  const boardError =
    personal.tasks.error ||
    household.tasks.error ||
    personal.items.error ||
    household.items.error;

  return (
    <PageShell
      width="wide"
      rail={
        isClient ? (
          <div className="flex flex-col gap-4 lg:sticky lg:top-8">
            <div>
              <h2
                className="mb-2 text-xs font-semibold tracking-wide uppercase"
                style={{ color: "var(--text-muted)" }}
              >
                At a glance
              </h2>
              <AgendaCounts entries={entries} />
            </div>
          </div>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        <PageHeading
          subtitle={
            isClient
              ? new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
              : undefined
          }
        >
          Agenda
        </PageHeading>

        {!isClient ? (
          <ListSkeleton rows={6} />
        ) : (
          <>
            <AgendaBoard
              entries={entries}
              lists={personal.lists.data}
              partnerLinked={partnerLinked}
              loading={loading}
              error={boardError}
              assignable={
                household.myUserId
                  ? {
                      myUserId: household.myUserId,
                      partnerId: household.partnerId,
                    }
                  : undefined
              }
              onCompleteReminder={onCompleteReminder}
              onUncompleteReminder={onUncompleteReminder}
              onEditReminder={onEditReminder}
              onDeleteReminder={onDeleteReminder}
              onCreateReminder={onCreateReminder}
              onEditExpiry={onEditExpiry}
              onDeleteExpiry={onDeleteExpiry}
              onCreateExpiry={onCreateExpiry}
            />

            {status !== "loading" && status !== "empty" && (
              <div
                className="mt-2 flex flex-col gap-6 border-t pt-6"
                style={{ borderColor: "var(--gridline)" }}
              >
                <Card tier="raw">
                  <CardTitle size="sm">Today so far</CardTitle>
                  <TodaySnapshot
                    events={events}
                    workoutLogs={workoutLogs}
                    periodLogs={periodLogs}
                    todayNotes={todayNotes}
                    yesterdayNotes={yesterdayNotes}
                    today={today}
                  />
                </Card>
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                  <PersonalTrendsSection trends={trends} findings={findings} />
                  <PeriodReviewSection
                    events={events}
                    workoutLogs={workoutLogs}
                    periodLogs={periodLogs}
                    today={today}
                    notesInRange={notesInRange}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}
