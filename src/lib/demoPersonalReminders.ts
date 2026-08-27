import type { TaskItem } from "@/lib/reminders";
import type { PersonalNote } from "@/lib/supabase/personalReminders";

/** Example data for the Personal Reminders page when signed out — same
 * idea as demoNotes.ts, scoped to this one page (no offline/local-only
 * mode, so there's nothing real to show until you're signed in). */
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const iso = (msOffset: number) => new Date(now() + msOffset).toISOString();

export function buildDemoPersonalNotes(): PersonalNote[] {
  return [
    {
      id: "demo-note-1",
      title: "Wifi router reset",
      body: "Hold the reset button for 10s, wait 2 minutes before reconnecting.",
      createdAt: iso(-3 * DAY),
      updatedAt: iso(-3 * DAY),
    },
    {
      id: "demo-note-2",
      title: null,
      body: "Book dentist appointment sometime this month.",
      createdAt: iso(-1 * DAY),
      updatedAt: iso(-1 * DAY),
    },
  ];
}

export function buildDemoPersonalTasks(): TaskItem[] {
  return [
    {
      id: "demo-task-1",
      title: "Renew car insurance",
      notes: "Compare quotes before renewing automatically.",
      dueAt: iso(-1 * DAY), // overdue
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
    },
    {
      id: "demo-task-2",
      title: "Submit expense report",
      notes: null,
      dueAt: iso(4 * DAY),
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
    },
    {
      id: "demo-task-3",
      title: "Change air filter",
      notes: "Living room unit.",
      dueAt: iso(20 * DAY),
      recurrenceDays: 90,
      lastCompletedAt: iso(-70 * DAY),
      lastCompletedBy: null,
      assignedTo: null,
    },
  ];
}
