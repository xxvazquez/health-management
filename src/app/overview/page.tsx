"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useData } from "@/lib/DataContext";
import { useAuth } from "@/lib/supabase/AuthContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { addDaysToDate, todayLocalISODate, type DateRange } from "@/lib/aggregations/common";
import { buildActivityFeed, buildActivityDateMap, type ActivityEntry } from "@/lib/aggregations/activity";
import { buildPersonalTrends, topCrossDomainFindings } from "@/lib/aggregations/overview";
import { fetchNoteThreads, notesConfigured, unreadNoteCount, type NoteThread } from "@/lib/supabase/notes";
import { getPartnerLink } from "@/lib/supabase/partner";
import { buildDemoThreads, DEMO_PARTNER_LABEL } from "@/lib/demoNotes";
import { TodaySnapshot, type DayNoteSummary } from "@/components/overview/TodaySnapshot";
import { ActivityFeed } from "@/components/overview/ActivityFeed";
import { PersonalTrendsSection } from "@/components/overview/PersonalTrendsSection";
import { ActivityCalendarSection } from "@/components/overview/ActivityCalendarSection";
import { PartnerNotesSection } from "@/components/overview/PartnerNotesSection";
import { PeriodReviewSection } from "@/components/overview/PeriodReviewSection";
import { Card, CardTitle } from "@/components/ui/Card";
import type { Bullet } from "@/lib/aggregations/insights";

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
 * Calendar → Partner Notes → Weekly/Monthly Review → Lauva Timeline, most
 * useful information first. Every section reads data that already exists
 * elsewhere in the app (DataContext's events/workoutLogs/periodLogs, plus
 * Notes fetched the same way the Notes page and Nav's unread badge already
 * do) — nothing here is a second copy of that data or a duplicate of what
 * Food/Workout/Cycle/Notes already show in depth; this is the at-a-glance
 * layer on top.
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
  const [partnerLabel, setPartnerLabel] = useState<string | null>(null);
  const [notesUnread, setNotesUnread] = useState(0);

  const loadNotes = useCallback(async () => {
    if (!session) {
      const demo = buildDemoThreads();
      setNoteThreads(demo);
      setPartnerLabel(DEMO_PARTNER_LABEL);
      setNotesUnread(demo.filter((t) => t.isUnreadForMe).length);
      return;
    }
    if (!notesConfigured) return;
    try {
      const link = await getPartnerLink();
      if (!link) {
        setNoteThreads([]);
        setPartnerLabel(null);
        setNotesUnread(0);
        return;
      }
      const [inbox, sent, unread] = await Promise.all([
        fetchNoteThreads("inbox"),
        fetchNoteThreads("sent"),
        unreadNoteCount(),
      ]);
      setNoteThreads([...inbox, ...sent]);
      // Never the partner's actual email — see notes/page.tsx's own note.
      setPartnerLabel("your partner");
      setNotesUnread(unread);
    } catch (err) {
      console.error("Overview: loading notes failed", err);
    }
  }, [session]);

  useEffect(() => {
    // Loading from Supabase (or seeding the demo set) on mount/sign-in — an
    // external-system read, not a React-state sync loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotes();
  }, [loadNotes]);

  const todayNotes = useMemo(() => noteThreads.filter((t) => localDateOf(t.lastMessageAt) === today).map(noteToDaySummary), [noteThreads, today]);
  const yesterdayNotes = useMemo(
    () => noteThreads.filter((t) => localDateOf(t.lastMessageAt) === yesterday).map(noteToDaySummary),
    [noteThreads, yesterday],
  );

  const notesByDate = useMemo(() => {
    const map = new Map<string, DayNoteSummary[]>();
    for (const t of noteThreads) {
      const d = localDateOf(t.lastMessageAt);
      const list = map.get(d) ?? [];
      list.push(noteToDaySummary(t));
      map.set(d, list);
    }
    return map;
  }, [noteThreads]);

  const notesInRange = useCallback(
    (range: DateRange) => noteThreads.filter((t) => {
      const d = localDateOf(t.lastMessageAt);
      return d >= range.start && d <= range.end;
    }).length,
    [noteThreads],
  );

  // ---- Recent Activity / Lauva Timeline: one shared flat feed, Notes
  // merged in — see ActivityFeed's own comment on why the two sections
  // reuse this exact same component/data rather than each building its own.
  const activityFeed = useMemo(() => {
    const base = buildActivityFeed(events, workoutLogs, periodLogs);
    const notes = noteThreads.map(noteToActivityEntry);
    return [...base, ...notes].sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [events, workoutLogs, periodLogs, noteThreads]);

  const activityDateMap = useMemo(() => {
    const map = buildActivityDateMap(events, workoutLogs, periodLogs);
    for (const t of noteThreads) {
      const d = localDateOf(t.lastMessageAt);
      const set = map.get(d) ?? new Set();
      set.add("notes");
      map.set(d, set);
    }
    return map;
  }, [events, workoutLogs, periodLogs, noteThreads]);

  // ---- Personal Trends
  const trends = useMemo(() => buildPersonalTrends(events, workoutLogs, periodLogs, today), [events, workoutLogs, periodLogs, today]);
  const findings = useMemo(() => topCrossDomainFindings(events, stoolLogs, workoutLogs), [events, stoolLogs, workoutLogs]);
  const notesTrend: Bullet | null = useMemo(() => {
    const last7 = notesInRange({ start: addDaysToDate(today, -6), end: today });
    const prior7 = notesInRange({ start: addDaysToDate(today, -13), end: addDaysToDate(today, -7) });
    if (Math.abs(last7 - prior7) < 2) return null;
    return {
      label: "Notes",
      detail: `${last7} note${last7 === 1 ? "" : "s"} exchanged in the last 7 days, vs. ${prior7} the week before.`,
      compact: `${last7} recently · ${prior7} before`,
    };
  }, [notesInRange, today]);

  if (status === "loading") {
    return <p style={{ color: "var(--text-secondary)" }}>Loading your data…</p>;
  }
  if (status === "empty") {
    return <EmptyState />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
        Overview
      </h1>

      <TodaySnapshot events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} todayNotes={todayNotes} yesterdayNotes={yesterdayNotes} today={today} />

      <Card tier="supporting">
        <CardTitle subtitle="What's happened lately, across everything you track — a glance, not the full log.">Recent activity</CardTitle>
        <ActivityFeed entries={activityFeed} initialLimit={10} emptyText="Nothing logged yet." />
      </Card>

      <PersonalTrendsSection trends={trends} findings={findings} notesTrend={notesTrend} />

      <ActivityCalendarSection events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} dateMap={activityDateMap} notesByDate={notesByDate} today={today} />

      <PartnerNotesSection threads={noteThreads} partnerLabel={partnerLabel} unreadCount={notesUnread} />

      <PeriodReviewSection events={events} workoutLogs={workoutLogs} periodLogs={periodLogs} today={today} notesInRange={notesInRange} />

      <Card tier="raw">
        <CardTitle
          size="sm"
          subtitle="Every logged moment, filterable by category — for understanding what happened, not managing records (that's the Log page)."
        >
          Lauva timeline
        </CardTitle>
        <ActivityFeed entries={activityFeed} showFilter initialLimit={20} pageSize={30} emptyText="Nothing logged yet." />
      </Card>
    </div>
  );
}
