"use client";

import { DateTimePicker } from "@/components/ui/DatePicker";
import { SwitchRow } from "@/components/ui/Switch";
import { useState, type FormEvent } from "react";
import { isRecurringTask, type TaskItem } from "@/lib/reminders";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS, ROW_STYLE, ROW_TEXT_CLS } from "@/components/ui/formField";

const DEFAULT_LIST_NAME = "Reminders";

/** The fields a create/edit form hands back — same tuple for both, so a
 * parent can point `onCreate` and `onEdit` at the same handler shape. */
export type TaskFormValues = {
  title: string;
  notes: string;
  dueAt: string | null;
  recurrenceDays: number | null;
  assignedTo: string | null;
  listId: string | null;
};

/** ISO timestamp -> the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants,
 * in the viewer's own timezone (matching how the form reads it back). */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Create OR edit form. `initial` (edit mode) pre-fills every field and
 * switches the button to "Save changes". Reused by Agenda for adding /
 * editing a reminder in either scope. */
export function TaskForm({
  accent,
  recurrenceMode,
  assignable,
  lists,
  defaultListId,
  initial,
  onSave,
  onCancel,
}: {
  accent: string;
  recurrenceMode: "none" | "optional" | "required";
  /** Home only — when set, offers an "Assigned to" dropdown (Anyone/Me/
   * Partner). Personal tasks have no second person to assign to. */
  assignable?: { myUserId: string; partnerId: string | null };
  /** Personal only — when set, offers a "List" dropdown. */
  lists?: ReminderList[];
  defaultListId?: string | null;
  initial?: TaskItem;
  onSave: (values: TaskFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [dueAtLocal, setDueAtLocal] = useState(initial?.dueAt && !isRecurringTask(initial) ? toLocalInput(initial.dueAt) : "");
  const [recurring, setRecurring] = useState(recurrenceMode === "required" || (initial != null && isRecurringTask(initial)));
  const [recurrenceDays, setRecurrenceDays] = useState(
    initial && isRecurringTask(initial) ? String(initial.recurrenceDays) : recurrenceMode === "required" ? "7" : "",
  );
  const [assignedTo, setAssignedTo] = useState(initial?.assignedTo ?? "");
  const [listId, setListId] = useState(initial?.listId ?? defaultListId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesRecurrence = recurrenceMode === "required" || (recurrenceMode === "optional" && recurring);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (usesRecurrence && (!recurrenceDays || Number(recurrenceDays) <= 0)) return;
    setSaving(true);
    setError(null);
    try {
      const dueAt = dueAtLocal
        ? new Date(dueAtLocal).toISOString()
        : usesRecurrence
          ? new Date(Date.now() + Number(recurrenceDays) * 86_400_000).toISOString()
          : null;
      await onSave({
        title,
        notes,
        dueAt,
        recurrenceDays: usesRecurrence ? Number(recurrenceDays) : null,
        assignedTo: assignedTo || null,
        listId: listId || null,
      });
    } catch (err) {
      console.error("task save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={initial ? "Edit reminder" : "New reminder"} onSubmit={handleSubmit} onCancel={onCancel}>
      <FormGroup>
        <Field label="What needs doing?">
          <input
            required
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Call the dentist"
            maxLength={150}
            className={`${ROW_TEXT_CLS} font-medium`}
            style={ROW_STYLE}
          />
        </Field>
        <Field label={<>Notes <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything useful to remember"
            className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
            style={ROW_STYLE}
          />
        </Field>
      </FormGroup>

      <FormGroup>
        {recurrenceMode === "optional" && <SwitchRow label="Repeats on a schedule" on={recurring} onChange={setRecurring} />}
        {lists && (
          <Field label="List" inline>
            <select value={listId} onChange={(e) => setListId(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
              <option value="">{DEFAULT_LIST_NAME}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {assignable && (
          <Field label="Assigned to" inline>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={ROW_INLINE_CLS} style={ROW_STYLE}>
              <option value="">Anyone</option>
              <option value={assignable.myUserId}>Me</option>
              {assignable.partnerId && <option value={assignable.partnerId}>Partner</option>}
            </select>
          </Field>
        )}
        {usesRecurrence ? (
          <Field label="Repeat every (days)" inline>
            <input
              type="number"
              min={1}
              required
              value={recurrenceDays}
              onChange={(e) => setRecurrenceDays(e.target.value)}
              className={`${ROW_INLINE_CLS} w-16`}
              style={ROW_STYLE}
            />
          </Field>
        ) : (
          <Field label={<>Deadline <span style={{ color: "var(--text-muted)" }}>· optional</span></>} inline>
            <DateTimePicker value={dueAtLocal} onChange={setDueAtLocal} optional title="Deadline" />
          </Field>
        )}
      </FormGroup>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" accent={accent} disabled={saving || !title.trim()}>
          {saving ? "Saving…" : initial ? "Save changes" : "Save reminder"}
        </Button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </FormShell>
  );
}
