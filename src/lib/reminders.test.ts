import { describe, expect, it } from "vitest";
import { expirationBucket, isExpirationDue, isRecurringTask, isTaskDone, isTaskDue, nextRecurringDueAt, type TaskItem } from "./reminders";

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

describe("isTaskDue", () => {
  const now = new Date("2026-06-15T12:00:00.000Z");

  it("is not due when there's no deadline", () => {
    expect(isTaskDue(makeTask({ dueAt: null }), now)).toBe(false);
  });

  it("is due once the deadline has passed", () => {
    expect(isTaskDue(makeTask({ dueAt: "2026-06-15T11:00:00.000Z" }), now)).toBe(true);
  });

  it("is not due before the deadline", () => {
    expect(isTaskDue(makeTask({ dueAt: "2026-06-15T13:00:00.000Z" }), now)).toBe(false);
  });

  it("a completed one-off task is never due again", () => {
    const task = makeTask({ dueAt: "2026-06-15T11:00:00.000Z", recurrenceDays: null, lastCompletedAt: "2026-06-15T11:30:00.000Z" });
    expect(isTaskDue(task, now)).toBe(false);
  });

  it("a recurring task past its next due_at is still due, even though it has a lastCompletedAt from a previous cycle", () => {
    const task = makeTask({ dueAt: "2026-06-15T11:00:00.000Z", recurrenceDays: 7, lastCompletedAt: "2026-06-08T11:00:00.000Z" });
    expect(isTaskDue(task, now)).toBe(true);
  });
});

describe("nextRecurringDueAt", () => {
  it("advances from the completion moment, not the previous due date — a late completion doesn't immediately re-show as due", () => {
    const completedAt = new Date("2026-06-20T09:00:00.000Z"); // completed 5 days late
    const next = nextRecurringDueAt(7, completedAt);
    expect(next).toBe("2026-06-27T09:00:00.000Z");
  });
});

describe("expirationBucket / isExpirationDue", () => {
  const today = "2026-06-15";

  it("is expired once the date has passed", () => {
    expect(expirationBucket({ expiresOn: "2026-06-14", remindDaysBefore: 3 }, today)).toBe("expired");
  });

  it("is 'soon' once within its own remind-before window", () => {
    expect(expirationBucket({ expiresOn: "2026-06-17", remindDaysBefore: 3 }, today)).toBe("soon");
  });

  it("is 'later' outside the remind-before window", () => {
    expect(expirationBucket({ expiresOn: "2026-06-30", remindDaysBefore: 3 }, today)).toBe("later");
  });

  it("a shorter remind-before window means 'soon' starts later, closer to the date", () => {
    // Same expiry date, but a 1-day window hasn't opened yet at 2 days out.
    expect(expirationBucket({ expiresOn: "2026-06-17", remindDaysBefore: 1 }, today)).toBe("later");
  });

  it("isExpirationDue mirrors the bucket: due once expired or soon, not once later", () => {
    expect(isExpirationDue({ expiresOn: "2026-06-14", remindDaysBefore: 3 }, today)).toBe(true);
    expect(isExpirationDue({ expiresOn: "2026-06-17", remindDaysBefore: 3 }, today)).toBe(true);
    expect(isExpirationDue({ expiresOn: "2026-06-30", remindDaysBefore: 3 }, today)).toBe(false);
  });
});
