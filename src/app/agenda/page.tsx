"use client";

import { useMemo } from "react";
import { usePersonalReminderBoards } from "@/lib/usePersonalReminderBoards";
import { useHouseholdReminderBoards } from "@/lib/useHouseholdReminderBoards";
import { useDoctors } from "@/lib/useDoctors";
import { usePartnerLinked } from "@/lib/usePartnerLinked";
import { todayLocalISODate } from "@/lib/aggregations/common";
import { useIsClient } from "@/lib/useIsClient";
import { buildAgenda, type AgendaEntry } from "@/lib/aggregations/agenda";
import { PageShell } from "@/components/ui/PageShell";
import { AgendaBoard } from "@/components/agenda/AgendaBoard";
import type { TaskFormValues } from "@/components/reminders/TaskForm";

/**
 * Agenda — the one "what needs my attention?" surface. Reminders (mine +
 * shared), product expiry, doctor follow-ups and upcoming appointments,
 * interleaved by *when they matter* into Overdue / Today / Tomorrow / Next
 * 7 days / Later / No date. Type, scope and list are filters, never the
 * primary grouping. Nothing else — the cross-domain read-back moved to
 * Trends → Overview.
 */
export default function AgendaPage() {
  const partnerLinked = usePartnerLinked();
  const personal = usePersonalReminderBoards();
  const household = useHouseholdReminderBoards();
  const doctors = useDoctors();
  const isClient = useIsClient();
  const today = useMemo(() => todayLocalISODate(), []);

  const upcomingAppointments = useMemo(
    () =>
      doctors.specialties.data
        .filter((s) => !s.isArchived && s.nextAppointmentDate)
        .map((s) => ({ id: s.id, label: `${s.name} appointment`, date: s.nextAppointmentDate as string })),
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
    [personal.tasks.data, household.tasks.data, personal.items.data, household.items.data, doctors.tasks.data, upcomingAppointments, today],
  );

  // --- action dispatch: route each row to its own scope's hook. Plain
  // functions (not memoized) — AgendaBoard isn't a memo component.
  const boardFor = (scope: "mine" | "shared") => (scope === "shared" ? household : personal);
  const onCompleteReminder = (e: AgendaEntry) => boardFor(e.scope as "mine" | "shared").tasks.complete(e.reminder!);
  const onUncompleteReminder = (e: AgendaEntry) => boardFor(e.scope as "mine" | "shared").tasks.uncomplete(e.reminder!);
  const onEditReminder = (e: AgendaEntry, v: TaskFormValues) => boardFor(e.scope as "mine" | "shared").tasks.edit(e.reminder!.id, v);
  const onDeleteReminder = (e: AgendaEntry) => boardFor(e.scope as "mine" | "shared").tasks.remove(e.reminder!.id);
  const onCreateReminder = (scope: "mine" | "shared", v: TaskFormValues) => boardFor(scope).tasks.create(v);
  const onEditExpiry = (e: AgendaEntry, name: string, on: string, remind: number) =>
    boardFor(e.scope as "mine" | "shared").items.edit(e.expiry!.id, name, on, remind);
  const onDeleteExpiry = (e: AgendaEntry) => boardFor(e.scope as "mine" | "shared").items.remove(e.expiry!.id);
  const onCreateExpiry = (scope: "mine" | "shared", name: string, on: string, remind: number) => boardFor(scope).items.create(name, on, remind);

  const loading =
    !personal.isDemo && (personal.tasks.loading || household.tasks.loading || personal.items.loading || household.items.loading);
  const boardError = personal.tasks.error || household.tasks.error || personal.items.error || household.items.error;

  return (
    <PageShell width="narrow">
      <AgendaBoard
        entries={entries}
        subtitle={
          isClient ? new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : undefined
        }
        lists={personal.lists.data}
        partnerLinked={partnerLinked}
        loading={loading || !isClient}
        error={boardError}
        assignable={household.myUserId ? { myUserId: household.myUserId, partnerId: household.partnerId } : undefined}
        onCompleteReminder={onCompleteReminder}
        onUncompleteReminder={onUncompleteReminder}
        onEditReminder={onEditReminder}
        onDeleteReminder={onDeleteReminder}
        onCreateReminder={onCreateReminder}
        onEditExpiry={onEditExpiry}
        onDeleteExpiry={onDeleteExpiry}
        onCreateExpiry={onCreateExpiry}
      />
    </PageShell>
  );
}
