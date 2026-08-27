import type { ExpirationItem, TaskItem } from "@/lib/reminders";
import type { HouseholdNote } from "@/lib/supabase/household";

/** Example data for the Home page when signed out — same idea as
 * demoNotes.ts/demoPersonalReminders.ts. "Me"/"partner" are fixed fake ids
 * so `lastCompletedBy` can demonstrate the "completed by you / your
 * partner" distinction without a real linked account. */
export const DEMO_HOME_ME_ID = "demo-home-me";
export const DEMO_HOME_PARTNER_ID = "demo-home-partner";

const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const iso = (msOffset: number) => new Date(now() + msOffset).toISOString();
const dateOffset = (daysOffset: number) => new Date(now() + daysOffset * DAY).toISOString().slice(0, 10);

export function buildDemoHouseholdNotes(): HouseholdNote[] {
  return [
    {
      id: "demo-home-note-1",
      title: "Landlord contact",
      body: "Building manager: Marta, 555-0142 — only for maintenance emergencies.",
      createdAt: iso(-10 * DAY),
      updatedAt: iso(-10 * DAY),
    },
    {
      id: "demo-home-note-2",
      title: null,
      body: "Guest towels are in the hallway closet, top shelf.",
      createdAt: iso(-2 * DAY),
      updatedAt: iso(-2 * DAY),
    },
  ];
}

export function buildDemoHouseholdTasks(): TaskItem[] {
  return [
    {
      id: "demo-home-task-1",
      title: "Pay internet bill",
      notes: null,
      dueAt: iso(-1 * DAY), // overdue
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
    },
    {
      id: "demo-home-task-2",
      title: "Take out recycling",
      notes: "Tuesday nights.",
      dueAt: iso(3 * DAY),
      recurrenceDays: 7,
      lastCompletedAt: iso(-4 * DAY),
      lastCompletedBy: DEMO_HOME_PARTNER_ID,
      assignedTo: DEMO_HOME_PARTNER_ID,
    },
    {
      id: "demo-home-task-3",
      title: "Clean bathroom",
      notes: null,
      dueAt: iso(6 * DAY),
      recurrenceDays: 14,
      lastCompletedAt: iso(-8 * DAY),
      lastCompletedBy: DEMO_HOME_ME_ID,
      assignedTo: DEMO_HOME_ME_ID,
    },
  ];
}

export function buildDemoHouseholdItems(): ExpirationItem[] {
  return [
    { id: "demo-home-item-1", name: "Milk", expiresOn: dateOffset(-1), remindDaysBefore: 2 },
    { id: "demo-home-item-2", name: "Yoghurt", expiresOn: dateOffset(2), remindDaysBefore: 3 },
    { id: "demo-home-item-3", name: "Canned tomatoes", expiresOn: dateOffset(60), remindDaysBefore: 7 },
  ];
}
