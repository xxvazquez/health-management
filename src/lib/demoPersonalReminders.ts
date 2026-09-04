import type { ExpirationItem, TaskItem } from "@/lib/reminders";
import type { PersonalNote, ReminderList } from "@/lib/supabase/personalReminders";

/** Example data for the Personal Reminders page when signed out — same
 * idea as demoNotes.ts, scoped to this one page (no offline/local-only
 * mode, so there's nothing real to show until you're signed in). */
const DAY = 24 * 60 * 60 * 1000;
const now = () => Date.now();
const iso = (msOffset: number) => new Date(now() + msOffset).toISOString();
const isoAtHour = (msOffset: number, hour: number) => {
  const d = new Date(now() + msOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

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

const DEMO_LIST_TODO = "demo-list-todo";
const DEMO_LIST_TOBUY = "demo-list-tobuy";
const DEMO_LIST_BATHROOM = "demo-list-bathroom";

export function buildDemoReminderLists(): ReminderList[] {
  return [
    { id: DEMO_LIST_TODO, name: "To Do", sortOrder: 0 },
    { id: DEMO_LIST_TOBUY, name: "To Buy", sortOrder: 1 },
    { id: DEMO_LIST_BATHROOM, name: "Bathroom", sortOrder: 2 },
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
      isArchived: false,
      listId: DEMO_LIST_TODO,
    },
    {
      id: "demo-task-2",
      title: "Submit expense report",
      notes: null,
      dueAt: isoAtHour(4 * DAY, 17),
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_TODO,
    },
    {
      id: "demo-task-7",
      title: "Call the pharmacy about the refill",
      notes: null,
      dueAt: isoAtHour(0, 15),
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_TODO,
    },
    {
      id: "demo-task-8",
      title: "Pick up the parcel",
      notes: null,
      dueAt: isoAtHour(1 * DAY, 9),
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_TODO,
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
      isArchived: false,
      listId: null,
    },
    {
      id: "demo-task-4",
      title: "Toothpaste",
      notes: null,
      dueAt: null,
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_TOBUY,
    },
    {
      id: "demo-task-5",
      title: "Dish soap",
      notes: null,
      dueAt: null,
      recurrenceDays: null,
      lastCompletedAt: null,
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_TOBUY,
    },
    {
      id: "demo-task-6",
      title: "Descale the showerhead",
      notes: null,
      dueAt: iso(2 * DAY),
      recurrenceDays: 30,
      lastCompletedAt: iso(-28 * DAY),
      lastCompletedBy: null,
      assignedTo: null,
      isArchived: false,
      listId: DEMO_LIST_BATHROOM,
    },
  ];
}

const isoDate = (msOffset: number) => new Date(now() + msOffset).toISOString().slice(0, 10);

export function buildDemoPersonalItems(): ExpirationItem[] {
  return [
    { id: "demo-item-1", name: "Vitamin D drops", expiresOn: isoDate(-2 * DAY), remindDaysBefore: 7 },
    { id: "demo-item-2", name: "Protein powder", expiresOn: isoDate(9 * DAY), remindDaysBefore: 5 },
    { id: "demo-item-3", name: "Magnesium", expiresOn: isoDate(140 * DAY), remindDaysBefore: 14 },
  ];
}
