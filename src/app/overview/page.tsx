"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSkeleton } from "@/components/ui/Skeleton";
import { addDaysToDate, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import { buildActivityFeed, type ActivityEntry } from "@/lib/aggregations/activity";
import { buildPersonalTrends, topCrossDomainFindings } from "@/lib/aggregations/overview";
import { buildAttentionItems } from "@/lib/aggregations/attention";
import { fetchNoteThreads, notesConfigured, type NoteThread } from "@/lib/supabase/notes";
import { getPartnerLink } from "@/lib/supabase/partner";
import { fetchPersonalItems, fetchPersonalTasks, type PersonalItem } from "@/lib/supabase/personalReminders";
import { fetchHouseholdItems, fetchHouseholdTasks } from "@/lib/supabase/household";
import { fetchDoctorFollowUpTasks, type DoctorFollowUpTask } from "@/lib/supabase/doctors";
import type { ExpirationItem, TaskItem } from "@/lib/reminders";
import { buildDemoPersonalItems, buildDemoPersonalTasks } from "@/lib/demoPersonalReminders";
import { buildDemoHouseholdItems, buildDemoHouseholdTasks } from "@/lib/demoHousehold";
import { buildDemoDoctorFollowUpTasks } from "@/lib/demoDoctors";
import { buildDemoThreads } from "@/lib/demoNotes";
import { TodaySnapshot, type DayNoteSummary } from "@/components/overview/TodaySnapshot";
import { ActivityFeed } from "@/components/overview/ActivityFeed";
import { AttentionBand } from "@/components/overview/AttentionBand";
import { PersonalTrendsSection } from "@/components/overview/PersonalTrendsSection";
import { PeriodReviewSection } from "@/components/overview/PeriodReviewSection";
import { Card, CardTitle } from "@/components/ui/Card";

/** Same local-calendar-day reasoning as `todayLocalISODate` — a note's
 * timestamp is a real instant (unlike every other domain's plain `date`
 * field), so it has to be bucketed by the *viewer's* calendar day, not a
 * naive UTC slice, or a note near midnight could land on the wrong day. */
function localDateOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function noteToDaySummary(t: NoteThread): DayNoteSummary {
  return {
    key: t.id,
    time: new Date(t.lastMessageAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    sortKey: t.lastMessageAt,
    label: t.isMine ? "Note sent" : "Note received",
    description: t.subject || t.body.slice(0, 60),
  };
}

function noteToActivityEntry(t: NoteThread): ActivityEntry {
  return {
    key: `notes:${t.id}`,
    date: localDateOf(t.lastMessageAt),
    time: new Date(t.lastMessageAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
    sortKey: t.lastMessageAt,
    domain: "notes",
    label: t.isMine ? "Note sent" : "Note received",
    description: t.subject || t.body.slice(0, 60),
  };
}

/**
 * Lauva's home/overview page — Today → Recent Activity → Personal Trends →
 * Weekly/Monthly Review, most useful information first. Every section reads
 * data that already exists elsewhere in the app (DataContext's
 * events/workoutLogs/periodLogs, plus partner notes fetched the same way
 * the Notes page does) — nothing here is a second copy of that data or a
 * duplicate of what Food/Workout/Cycle/Notes already show in depth; this is
 * the at-a-glance layer on top.
 */
export default function OverviewPage() {
  const { status, events, workoutLogs, stoolLogs, periodLogs } = useData();
  const { session } = useAuth();
  const today = useMemo(() => todayLocalISODate(), []);
  const yesterday = useMemo(() => addDaysToDate(today, -1), [today]);

  // ---- Notes: fetched separately from everything above — Notes lives in
  // Supabase directly, never the IndexedDB cache (see notes.ts's own
  // comment) — so it needs its own load, same as the Nav's unread badge.
  // Signed-out visitors see the same fixed example dataset /notes itself
  // shows them, so Overview never disagrees with what /notes would show
  // for the same account state.
  const [noteThreads, setNoteThreads] = useState<NoteThread[]>([]);
  const [expirationItems, setExpirationItems] = useState<PersonalItem[]>([]);
  // Extra sources for the Attention band — reminders, shared items, and
  // doctor follow-ups aren't in DataContext (they go straight to Supabase),
  // so Overview fetches them the same way it already does notes.
  const [personalTasks, setPersonalTasks] = useState<TaskItem[]>([]);
  const [householdTasks, setHouseholdTasks] = useState<TaskItem[]>([]);
  const [householdItems, setHouseholdItems] = useState<ExpirationItem[]>([]);
  const [followUps, setFollowUps] = useState<DoctorFollowUpTask[]>([]);

  const loadNotes = useCallback(async () => {
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
      setNoteThreads([...inbox, ...sent]);
    } catch (err) {
      console.error("Overview: loading notes failed", err);
    }
  }, [session]);

  const loadExpiration = useCallback(async () => {
    if (!session) {
      setExpirationItems(buildDemoPersonalItems());
      return;
    }
    try {
      setExpirationItems(await fetchPersonalItems());
    } catch (err) {
      console.error("Overview: loading expiration items failed", err);
    }
  }, [session]);

  const loadOutstanding = useCallback(async () => {
    if (!session) {
      setPersonalTasks(buildDemoPersonalTasks());
      setHouseholdTasks(buildDemoHouseholdTasks());
      setHouseholdItems(buildDemoHouseholdItems());
      setFollowUps(buildDemoDoctorFollowUpTasks());
      return;
    }
    try {
      const [pt, ht, hi, fu] = await Promise.all([
        fetchPersonalTasks(),
        fetchHouseholdTasks(),
        fetchHouseholdItems(),
        fetchDoctorFollowUpTasks(),
      ]);
      setPersonalTasks(pt);
      setHouseholdTasks(ht);
      setHouseholdItems(hi);
      setFollowUps(fu);
    } catch (err) {
      console.error("Overview: loading outstanding items failed", err);
    }
  }, [session]);

  useEffect(() => {
    // Loading from Supabase (or seeding the demo set) on mount/sign-in — an
    // external-system read, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotes();
    void loadExpiration();
    void loadOutstanding();
  }, [loadNotes, loadExpiration, loadOutstanding]);

  const unreadMessages = useMemo(
    () => noteThreads.filter((t) => !t.isMine && t.isUnreadForMe).length,
    [noteThreads],
  );

  const attentionItems = useMemo(
    () =>
      buildAttentionItems(
        {
          personalReminders: personalTasks,
          householdReminders: householdTasks,
          personalExpiry: expirationItems,
          householdExpiry: householdItems,
          followUps,
          unreadMessages,
        },
        { today },
      ),
    [personalTasks, householdTasks, expirationItems, householdItems, followUps, unreadMessages, today],
  );

  const todayNotes = useMemo(() => noteThreads.filter((t) => localDateOf(t.lastMessageAt) === today).map(noteToDaySummary), [noteThreads, today]);
  const yesterdayNotes = useMemo(
    () => noteThreads.filter((t) => localDateOf(t.lastMessageAt) === yesterday).map(noteToDaySummary),
    [noteThreads, yesterday],
  );

  const notesInRange = useCallback(
    (range: DateRange) => noteThreads.filter((t) => {
      const d = localDateOf(t.lastMessageAt);
      return d >= range.start && d <= range.end;
    }).length,
    [noteThreads],
  );

  // ---- Recent Activity: one shared flat feed, partner notes merged in,
  // ordered by each entry's real date (then time-of-day) — see
  // buildActivityFeed's own comment.
  const activityFeed = useMemo(() => {
    const base = buildActivityFeed(events, workoutLogs, periodLogs);
    const notes = noteThreads.map(noteToActivityEntry);
    // Today already has its own detailed section above — "Recent activity"
    // is strictly what came before, so the two never show the same entry.
    return [...base, ...notes]
      .filter((e) => e.date < today)
      .sort((a, b) => b.date.localeCompare(a.date) || b.sortKey.localeCompare(a.sortKey));
  }, [events, workoutLogs, periodLogs, noteThreads, today]);

  // ---- Personal Trends
  const trends = useMemo(() => buildPersonalTrends(events, workoutLogs, periodLogs, today), [events, workoutLogs, periodLogs, today]);
  const findings = useMemo(() => topCrossDomainFindings(events, stoolLogs, workoutLogs), [events, stoolLogs, workoutLogs]);

  if (status === "loading") {
    return <PageSkeleton cards={4} />;
  }
  if (status === "empty") {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Overview
      </h1>

      <AttentionBand items={attentionItems} />

      <TodaySnapshot events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} todayNotes={todayNotes} yesterdayNotes={yesterdayNotes} today={today} />

      <Card tier="supporting">
        <CardTitle>Recent activity</CardTitle>
        <ActivityFeed entries={activityFeed} showFilter initialLimit={12} pageSize={30} emptyText="Nothing logged yet." />
      </Card>

      <PersonalTrendsSection trends={trends} findings={findings} />

      <PeriodReviewSection events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} today={today} notesInRange={notesInRange} />
    </div>
  );
}
