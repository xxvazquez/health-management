import { describe, expect, it } from "vitest";
import { isRecurringTask, isTaskDone, nextRecurringDueAt, type TaskItem } from "./reminders";

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
  it("advances from the completion moment, not the previous due date — a late completion doesn't immediately re-show as due", () => {
    const completedAt = new Date("2026-06-20T09:00:00.000Z"); // completed 5 days late
    const next = nextRecurringDueAt(7, completedAt);
    expect(next).toBe("2026-06-27T09:00:00.000Z");
  });
});
