import { describe, expect, it } from "vitest";
import { isRecurringTask, isTaskDone, nextRecurringDueAt, rememberDueBeforeCompletion, rewoundRecurringDueAt, type TaskItem } from "./reminders";

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: "task-1",
    title: "Take out rubbish",
    notes: null,
    dueAt: null,
    recurrenceDays: null,
    lastCompletedAt: null,
    lastCompletedBy: null,
    assignedTo: null,
    isArchived: false,
    listId: null,
    subitems: [],
    ...overrides,
  };
}

describe("isRecurringTask / isTaskDone", () => {
  it("a one-off task with no recurrence is not recurring", () => {
    expect(isRecurringTask(makeTask({ recurrenceDays: null }))).toBe(false);
  });

  it("a task with recurrenceDays set is recurring", () => {
    expect(isRecurringTask(makeTask({ recurrenceDays: 7 }))).toBe(true);
  });

  it("a one-off task is done once lastCompletedAt is set", () => {
    expect(isTaskDone(makeTask({ recurrenceDays: null, lastCompletedAt: "2026-01-01T00:00:00.000Z" }))).toBe(true);
  });

  it("a one-off task with no completion is not done", () => {
    expect(isTaskDone(makeTask({ recurrenceDays: null, lastCompletedAt: null }))).toBe(false);
  });

  it("a recurring task is never permanently done, even after a completion", () => {
    expect(isTaskDone(makeTask({ recurrenceDays: 7, lastCompletedAt: "2026-01-01T00:00:00.000Z" }))).toBe(false);
  });
});

describe("nextRecurringDueAt", () => {
  it("advances from the completion day, not the previous due date — a late completion doesn't immediately re-show as due", () => {
    const completedAt = new Date(2026, 5, 20, 9, 0); // completed 5 days late
    expect(nextRecurringDueAt(7, completedAt)).toBe(new Date(2026, 5, 27, 9, 0).toISOString());
  });

  it("keeps the reminder's own time of day, not the moment it was ticked", () => {
    const due = new Date(2026, 5, 13, 8, 0).toISOString();
    expect(nextRecurringDueAt(7, new Date(2026, 5, 13, 22, 15), due)).toBe(new Date(2026, 5, 20, 8, 0).toISOString());
  });

  it("holds the local time across a clock change", () => {
    const due = new Date(2026, 9, 21, 8, 0).toISOString();
    const next = new Date(nextRecurringDueAt(7, new Date(2026, 9, 21, 9, 0), due));
    expect([next.getDate(), next.getHours(), next.getMinutes()]).toEqual([28, 8, 0]);
  });

  it("counts a completion after midnight toward the previous day", () => {
    const due = new Date(2026, 5, 13, 22, 0).toISOString();
    expect(nextRecurringDueAt(1, new Date(2026, 5, 14, 0, 30), due)).toBe(new Date(2026, 5, 14, 22, 0).toISOString());
  });
});

describe("rewoundRecurringDueAt", () => {
  it("undoes a completion back to the completion day at the task's own time", () => {
    const due = new Date(2026, 5, 13, 8, 0).toISOString();
    const completedAt = new Date(2026, 5, 13, 22, 15);
    const next = nextRecurringDueAt(7, completedAt, due);
    expect(rewoundRecurringDueAt({ id: "t", dueAt: next, recurrenceDays: 7, lastCompletedAt: completedAt.toISOString() })).toBe(due);
  });

  it("restores the exact due date of a task ticked early in this session", () => {
    const due = new Date(2026, 5, 20, 8, 0).toISOString();
    const completedAt = new Date(2026, 5, 17, 9, 0).toISOString();
    rememberDueBeforeCompletion("early", completedAt, due);
    const next = nextRecurringDueAt(7, new Date(completedAt), due);
    expect(rewoundRecurringDueAt({ id: "early", dueAt: next, recurrenceDays: 7, lastCompletedAt: completedAt })).toBe(due);
  });

  it("ignores a remembered date from a different completion", () => {
    const due = new Date(2026, 5, 20, 8, 0).toISOString();
    rememberDueBeforeCompletion("other", new Date(2026, 5, 1, 9, 0).toISOString(), due);
    const completedAt = new Date(2026, 5, 17, 9, 0);
    const next = nextRecurringDueAt(7, completedAt, due);
    expect(rewoundRecurringDueAt({ id: "other", dueAt: next, recurrenceDays: 7, lastCompletedAt: completedAt.toISOString() })).toBe(new Date(2026, 5, 17, 8, 0).toISOString());
  });
});
