import { describe, expect, it } from "vitest";
import { expirationBucket, isExpirationDue, isRecurringTask, isTaskDone, isTaskDue, nextRecurringDueAt, taskTimeBucket, type TaskItem } from "./reminders";

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

describe("expirationBucket", () => {
  // Monday, so the ISO week runs 2026-06-15 … 2026-06-21.
  const today = "2026-06-15";

  it("is expired once the date has passed", () => {
    expect(expirationBucket({ expiresOn: "2026-06-14" }, today)).toBe("expired");
  });

  it("buckets against real calendar periods, not fixed day counts", () => {
    expect(expirationBucket({ expiresOn: "2026-06-15" }, today)).toBe("this_week"); // today
    expect(expirationBucket({ expiresOn: "2026-06-21" }, today)).toBe("this_week"); // Sunday
    expect(expirationBucket({ expiresOn: "2026-06-22" }, today)).toBe("next_week"); // next Monday
    expect(expirationBucket({ expiresOn: "2026-06-28" }, today)).toBe("next_week"); // next Sunday
    expect(expirationBucket({ expiresOn: "2026-06-29" }, today)).toBe("next_month"); // still June, but past next week
    expect(expirationBucket({ expiresOn: "2026-07-31" }, today)).toBe("next_month"); // end of July
    expect(expirationBucket({ expiresOn: "2026-08-01" }, today)).toBe("two_months");
    expect(expirationBucket({ expiresOn: "2026-08-31" }, today)).toBe("two_months"); // end of August
    expect(expirationBucket({ expiresOn: "2026-09-01" }, today)).toBe("six_months");
    expect(expirationBucket({ expiresOn: "2026-12-31" }, today)).toBe("six_months"); // end of December
    expect(expirationBucket({ expiresOn: "2027-01-01" }, today)).toBe("later");
  });
});

describe("isExpirationDue", () => {
  const today = "2026-06-15";

  it("is due once today has reached the item's own remind-before window", () => {
    expect(isExpirationDue({ expiresOn: "2026-06-14", remindDaysBefore: 3 }, today)).toBe(true);
    expect(isExpirationDue({ expiresOn: "2026-06-17", remindDaysBefore: 3 }, today)).toBe(true);
    expect(isExpirationDue({ expiresOn: "2026-06-30", remindDaysBefore: 3 }, today)).toBe(false);
  });

  it("a shorter remind-before window means due starts later, closer to the date", () => {
    expect(isExpirationDue({ expiresOn: "2026-06-17", remindDaysBefore: 1 }, today)).toBe(false);
  });
});

describe("taskTimeBucket", () => {
  const now = new Date("2026-06-15T09:00:00"); // local

  const at = (d: string) => new Date(`${d}T12:00:00`).toISOString();

  it("has no due date → later", () => {
    expect(taskTimeBucket({ dueAt: null }, now)).toBe("later");
  });

  it("buckets by how many days out the due date is", () => {
    expect(taskTimeBucket({ dueAt: at("2026-06-14") }, now)).toBe("overdue");
    expect(taskTimeBucket({ dueAt: at("2026-06-15") }, now)).toBe("today");
    expect(taskTimeBucket({ dueAt: at("2026-06-16") }, now)).toBe("next_week"); // 1 day
    expect(taskTimeBucket({ dueAt: at("2026-06-22") }, now)).toBe("next_week"); // 7 days
    expect(taskTimeBucket({ dueAt: at("2026-06-23") }, now)).toBe("two_weeks"); // 8 days
    expect(taskTimeBucket({ dueAt: at("2026-06-29") }, now)).toBe("two_weeks"); // 14 days
    expect(taskTimeBucket({ dueAt: at("2026-06-30") }, now)).toBe("next_month"); // 15 days
    expect(taskTimeBucket({ dueAt: at("2026-07-16") }, now)).toBe("next_month"); // 31 days
    expect(taskTimeBucket({ dueAt: at("2026-07-17") }, now)).toBe("later"); // 32 days
  });
});
