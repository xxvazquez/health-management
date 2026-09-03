import { describe, expect, it } from "vitest";
import { attentionSummary, buildAttentionItems } from "./attention";
import type { TaskItem, ExpirationItem } from "@/lib/reminders";
import type { DoctorFollowUpTask } from "@/lib/supabase/doctors";

const TODAY = "2026-08-29";
const NOW = new Date("2026-08-29T12:00:00");

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

describe("buildAttentionItems", () => {
  it("returns nothing when nothing is outstanding", () => {
    expect(buildAttentionItems({}, { today: TODAY, now: NOW })).toEqual([]);
  });

  it("buckets a reminder by its due moment", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [
          task({ title: "Overdue", dueAt: "2026-08-27T09:00:00" }),
          task({ title: "Later today", dueAt: "2026-08-29T20:00:00" }),
          task({ title: "In two days", dueAt: "2026-08-31T09:00:00" }),
          task({ title: "Next week", dueAt: "2026-09-10T09:00:00" }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => `${i.tier}:${i.label}`)).toEqual(["overdue:Overdue", "today:Later today", "soon:In two days"]);
  });

  it("ignores archived, done, and undated reminders", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [
          task({ title: "Archived", dueAt: "2026-08-27T09:00:00", isArchived: true }),
          task({ title: "Done", dueAt: "2026-08-27T09:00:00", lastCompletedAt: "2026-08-28T10:00:00" }),
          task({ title: "Undated" }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items).toEqual([]);
  });

  it("surfaces expiry only inside its remind window and tiers it by date", () => {
    const items = buildAttentionItems(
      {
        personalExpiry: [
          expiry({ name: "Expired", expiresOn: "2026-08-20" }),
          expiry({ name: "Today", expiresOn: TODAY }),
          expiry({ name: "Soon", expiresOn: "2026-08-31", remindDaysBefore: 5 }),
          expiry({ name: "Not yet", expiresOn: "2026-09-30", remindDaysBefore: 2 }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => `${i.tier}:${i.label}`)).toEqual(["overdue:Expired", "today:Today", "soon:Soon"]);
  });

  it("includes uncompleted follow-ups with a due date", () => {
    const items = buildAttentionItems(
      {
        followUps: [
          followUp({ description: "Overdue scan", dueDate: "2026-08-01" }),
          followUp({ description: "Done scan", dueDate: "2026-08-01", completedAt: "2026-08-02T10:00:00" }),
          followUp({ description: "No date" }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => i.label)).toEqual(["Overdue scan"]);
    expect(items[0].href).toBe("/medical#followups");
  });

  it("surfaces a follow-up once its reminder has fired, even past the due window", () => {
    const items = buildAttentionItems(
      {
        followUps: [
          followUp({ description: "Reminder fired", dueDate: "2026-09-20", reminderAt: "2026-08-28T09:00:00" }),
          followUp({ description: "Reminder later", dueDate: "2026-09-20", reminderAt: "2026-09-19T09:00:00" }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => `${i.tier}:${i.label}`)).toEqual(["soon:Reminder fired"]);
  });

  it("includes an upcoming appointment within two weeks, tiered by its date", () => {
    const items = buildAttentionItems(
      {
        upcomingAppointments: [
          { id: "s1", label: "Dentist appointment", date: "2026-09-05" },
          { id: "s2", label: "Today appointment", date: TODAY },
          { id: "s3", label: "Far off appointment", date: "2026-10-30" },
          { id: "s4", label: "Past appointment", date: "2026-08-01" },
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => `${i.tier}:${i.label}`)).toEqual(["today:Today appointment", "soon:Dentist appointment"]);
    expect(items[0].href).toBe("/medical");
  });

  it("files each row into an urgency group with scannable timing", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [
          task({ title: "Two days ago", dueAt: "2026-08-27T09:00:00" }),
          task({ title: "Yesterday", dueAt: "2026-08-28T09:00:00" }),
          task({ title: "Tomorrow", dueAt: "2026-08-30T09:00:00" }),
          task({ title: "In four days", dueAt: "2026-09-02T09:00:00" }),
        ],
        personalExpiry: [
          expiry({ name: "Long gone", expiresOn: "2026-08-20" }),
          expiry({ name: "Expires today", expiresOn: TODAY }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    const group = Object.fromEntries(items.map((i) => [i.label, i.group]));
    expect(group["Two days ago"]).toBe("overdue");
    expect(group["Yesterday"]).toBe("overdue");
    expect(group["Long gone"]).toBe("overdue");
    expect(group["Expires today"]).toBe("today");
    expect(group["Tomorrow"]).toBe("tomorrow");
    expect(group["In four days"]).toBe("week");

    const when = Object.fromEntries(items.map((i) => [i.label, i.when]));
    expect(when["Two days ago"]).toBe("2 days ago");
    expect(when["Yesterday"]).toBe("yesterday");
    expect(when["Long gone"]).toBe("9 days ago");
  });

  it("gives unread messages no timing label", () => {
    const items = buildAttentionItems({ unreadMessages: 2 }, { today: TODAY, now: NOW });
    expect(items[0].when).toBe("");
  });

  it("adds one row for unread messages, always last within its tier", () => {
    const items = buildAttentionItems(
      { personalReminders: [task({ title: "Upcoming", dueAt: "2026-08-31T09:00:00" })], unreadMessages: 2 },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => i.label)).toEqual(["Upcoming", "2 unread messages"]);
  });

  it("orders overdue → today → soon, then soonest-first within a tier", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [
          task({ title: "Very overdue", dueAt: "2026-08-10T09:00:00" }),
          task({ title: "Just overdue", dueAt: "2026-08-29T09:00:00" }),
        ],
        householdReminders: [task({ title: "Tomorrow", dueAt: "2026-08-30T09:00:00" })],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.map((i) => i.label)).toEqual(["Very overdue", "Just overdue", "Tomorrow"]);
  });

  it("keeps personal and household reminders on their own routes", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [task({ title: "P", dueAt: "2026-08-27T09:00:00" })],
        householdReminders: [task({ title: "H", dueAt: "2026-08-27T09:00:00" })],
      },
      { today: TODAY, now: NOW },
    );
    expect(items.find((i) => i.label === "P")?.href).toBe("/personal#reminders");
    expect(items.find((i) => i.label === "H")?.href).toBe("/home#tasks");
  });
});

describe("attentionSummary", () => {
  it("summarises the tier counts", () => {
    const items = buildAttentionItems(
      {
        personalReminders: [
          task({ title: "a", dueAt: "2026-08-20T09:00:00" }),
          task({ title: "b", dueAt: "2026-08-21T09:00:00" }),
          task({ title: "c", dueAt: "2026-08-29T20:00:00" }),
          task({ title: "d", dueAt: "2026-08-31T09:00:00" }),
        ],
      },
      { today: TODAY, now: NOW },
    );
    expect(attentionSummary(items)).toBe("2 overdue · 1 due today · 1 coming up");
  });
});
