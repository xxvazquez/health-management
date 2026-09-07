"use client";

import { useState, type FormEvent } from "react";
import { isRecurringTask, type TaskItem } from "@/lib/reminders";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { FIELD_CLS as fieldCls, FIELD_STYLE as fieldStyle, LABEL_CLS as labelCls, LABEL_STYLE as labelStyle } from "@/components/ui/formField";

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
      <Field label="What needs doing?">
        <input
          required
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Call the dentist"
          maxLength={150}
          className={`${fieldCls} font-medium`}
          style={fieldStyle}
        />
      </Field>

      <Field label={<>Notes <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Anything useful to remember"
          className={`${fieldCls} resize-y leading-relaxed`}
          style={fieldStyle}
        />
      </Field>

      {recurrenceMode === "optional" && (
        <label className="flex items-center gap-2 text-xs font-medium" style={labelStyle}>
          <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} style={{ accentColor: accent }} />
          Repeats on a schedule
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {lists && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              List
            </label>
            <select value={listId} onChange={(e) => setListId(e.target.value)} className={fieldCls} style={fieldStyle}>
              <option value="">{DEFAULT_LIST_NAME}</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {assignable && (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Assigned to
            </label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className={fieldCls} style={fieldStyle}>
              <option value="">Anyone</option>
              <option value={assignable.myUserId}>Me</option>
              {assignable.partnerId && <option value={assignable.partnerId}>Partner</option>}
            </select>
          </div>
        )}

        {usesRecurrence ? (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Repeat every
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                required
                value={recurrenceDays}
                onChange={(e) => setRecurrenceDays(e.target.value)}
                className={`${fieldCls} w-20`}
                style={fieldStyle}
              />
              <span className="text-xs" style={labelStyle}>
                days
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label className={labelCls} style={labelStyle}>
              Deadline <span style={{ color: "var(--text-muted)" }}>· optional</span>
            </label>
            <input type="datetime-local" value={dueAtLocal} onChange={(e) => setDueAtLocal(e.target.value)} className={fieldCls} style={fieldStyle} />
          </div>
        )}
      </div>

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
