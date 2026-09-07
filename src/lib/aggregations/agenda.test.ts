import { describe, expect, it } from "vitest";
import { buildAgenda, type AgendaSources } from "./agenda";
import type { ExpirationItem, TaskItem } from "@/lib/reminders";
import type { DoctorFollowUpTask } from "@/lib/supabase/doctors";

const TODAY = "2026-08-29";
const NOW = new Date("2026-08-29T12:00:00");

function sources(overrides: Partial<AgendaSources> = {}): AgendaSources {
  return {
    personalReminders: [],
    sharedReminders: [],
    personalExpiry: [],
    sharedExpiry: [],
    followUps: [],
    upcomingAppointments: [],
    ...overrides,
  };
}

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: `t-${Math.random()}`,
    title: "A task",
    notes: null,
    dueAt: null,
    recurrenceDays: null,
    lastCompletedAt: null,
    lastCompletedBy: null,
    assignedTo: null,
    isArchived: false,
    listId: null,
    ...overrides,
  };
}

function expiry(overrides: Partial<ExpirationItem> = {}): ExpirationItem {
  return { id: `e-${Math.random()}`, name: "Milk", expiresOn: TODAY, remindDaysBefore: 3, ...overrides };
}

function followUp(overrides: Partial<DoctorFollowUpTask> = {}): DoctorFollowUpTask {
  return { id: `f-${Math.random()}`, appointmentId: "a1", description: "Book scan", dueDate: null, reminderAt: null, completedAt: null, ...overrides };
}

describe("buildAgenda", () => {
  it("returns nothing when nothing is outstanding", () => {
    expect(buildAgenda(sources(), { today: TODAY, now: NOW })).toEqual([]);
  });

  it("buckets reminders by their due moment", () => {
    const entries = buildAgenda(
      sources({
        personalReminders: [
          task({ title: "Overdue", dueAt: "2026-08-27T09:00:00" }),
          task({ title: "Later today", dueAt: "2026-08-29T20:00:00" }),
          task({ title: "Tomorrow", dueAt: "2026-08-30T09:00:00" }),
          task({ title: "This week", dueAt: "2026-09-03T09:00:00" }),
          task({ title: "Later", dueAt: "2026-09-20T09:00:00" }),
          task({ title: "Someday" }),
        ],
      }),
      { today: TODAY, now: NOW },
    );
    expect(entries.map((e) => `${e.bucket}:${e.title}`)).toEqual([
      "overdue:Overdue",
      "today:Later today",
      "tomorrow:Tomorrow",
      "week:This week",
      "later:Later",
      "someday:Someday",
    ]);
  });

  it("files completed reminders under done and skips archived ones", () => {
    const entries = buildAgenda(
      sources({
        personalReminders: [
          task({ title: "Archived", dueAt: "2026-08-27T09:00:00", isArchived: true }),
          task({ title: "Done", dueAt: "2026-08-27T09:00:00", lastCompletedAt: "2026-08-28T10:00:00" }),
        ],
      }),
      { today: TODAY, now: NOW },
    );
    expect(entries.map((e) => `${e.bucket}:${e.title}`)).toEqual(["done:Done"]);
  });

  it("tags each entry with its scope", () => {
    const entries = buildAgenda(
      sources({
        personalReminders: [task({ title: "Mine", dueAt: "2026-08-30T09:00:00" })],
        sharedReminders: [task({ title: "Shared", dueAt: "2026-08-30T09:00:00" })],
        followUps: [followUp({ description: "Scan", dueDate: "2026-08-30" })],
      }),
      { today: TODAY, now: NOW },
    );
    const byTitle = Object.fromEntries(entries.map((e) => [e.title, e.scope]));
    expect(byTitle).toEqual({ Mine: "mine", Shared: "shared", Scan: "medical" });
  });

  it("interleaves reminders, expiry and appointments by when they matter", () => {
    const entries = buildAgenda(
      sources({
        personalReminders: [task({ title: "Reminder tomorrow", dueAt: "2026-08-30T09:00:00" })],
        personalExpiry: [expiry({ name: "Yoghurt", expiresOn: "2026-08-27" })],
        upcomingAppointments: [{ id: "ap1", label: "Dentist appointment", date: "2026-08-30" }],
      }),
      { today: TODAY, now: NOW },
    );
    expect(entries.map((e) => `${e.bucket}:${e.kind}`)).toEqual(["overdue:expiry", "tomorrow:appointment", "tomorrow:reminder"]);
  });

  it("drops appointments beyond the 14-day horizon", () => {
    const entries = buildAgenda(
      sources({ upcomingAppointments: [{ id: "ap1", label: "Far off", date: "2026-09-30" }] }),
      { today: TODAY, now: NOW },
    );
    expect(entries).toEqual([]);
  });

  it("treats a date-only expiry as due today, not overdue, at midday", () => {
    const entries = buildAgenda(sources({ personalExpiry: [expiry({ expiresOn: TODAY })] }), { today: TODAY, now: NOW });
    expect(entries[0].bucket).toBe("today");
  });
});
