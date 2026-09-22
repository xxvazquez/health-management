import type { TaskSubitem } from "@/lib/reminders";
import { deleteDirect, upsertDirect } from "./directWrite";

/** Diffs a task's previous sub-items against its saved draft and issues the
 * upserts/deletes to match — each sub-item is addressed by its own
 * client-generated id, so this never needs a bulk "replace all" call.
 * Shared between personal_task_subitems and household_task_subitems;
 * `extraPayload` adds whatever column the table needs beyond the common
 * ones (personal_task_subitems also wants user_id). */
export async function saveTaskSubitems(
  userId: string,
  table: string,
  taskId: string,
  previous: TaskSubitem[],
  next: TaskSubitem[],
  extraPayload?: Record<string, unknown>,
): Promise<void> {
  const nextIds = new Set(next.map((s) => s.id));
  const removed = previous.filter((s) => !nextIds.has(s.id));
  const nowIso = new Date().toISOString();
  await Promise.all([
    ...removed.map((s) => deleteDirect(userId, table, s.id)),
    ...next.map((s, i) =>
      upsertDirect(userId, table, s.id, {
        id: s.id,
        task_id: taskId,
        title: s.title.trim(),
        is_done: s.done,
        sort_order: i,
        updated_at: nowIso,
        ...extraPayload,
      }),
    ),
  ]);
}

/** Flips one sub-item's checked state without touching the rest of the
 * task — the fast path from Agenda's row list, as opposed to the full
 * create/edit form's `saveTaskSubitems`. */
export async function toggleTaskSubitem(
  userId: string,
  table: string,
  taskId: string,
  subitem: TaskSubitem,
  extraPayload?: Record<string, unknown>,
): Promise<void> {
  await upsertDirect(userId, table, subitem.id, {
    id: subitem.id,
    task_id: taskId,
    title: subitem.title.trim(),
    is_done: !subitem.done,
    sort_order: subitem.order,
    updated_at: new Date().toISOString(),
    ...extraPayload,
  });
}
