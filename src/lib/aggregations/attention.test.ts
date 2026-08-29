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
    expect(items[0].href).toBe("/doctors#followups");
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
