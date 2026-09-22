"use client";

import { DateTimePicker } from "@/components/ui/DatePicker";
import { SwitchRow } from "@/components/ui/Switch";
import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { isRecurringTask, type TaskItem, type TaskSubitem } from "@/lib/reminders";
import type { ReminderList } from "@/lib/supabase/personalReminders";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { FormGroup } from "@/components/ui/FormGroup";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { CloseIcon, PlusIcon } from "@/components/ui/icons";
import { createTimeOrderedId } from "@/lib/sortableId";
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
  subitems: TaskSubitem[];
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
  const [subitems, setSubitems] = useState<TaskSubitem[]>(initial?.subitems ?? []);
  const [newSubitemText, setNewSubitemText] = useState("");
  const newSubitemRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usesRecurrence = recurrenceMode === "required" || (recurrenceMode === "optional" && recurring);

  function addSubitem() {
    const trimmed = newSubitemText.trim();
    if (!trimmed) return;
    setSubitems((prev) => [...prev, { id: createTimeOrderedId(), title: trimmed, done: false, order: prev.length }]);
    setNewSubitemText("");
    newSubitemRef.current?.focus();
  }

  function handleNewSubitemKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addSubitem();
    }
  }

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
        subitems: subitems.map((s, i) => ({ ...s, order: i })),
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
          <AutoGrowTextarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxRows={12}
            placeholder="Anything useful to remember"
            className={`${ROW_TEXT_CLS} resize-none leading-relaxed`}
            style={ROW_STYLE}
          />
        </Field>
      </FormGroup>

      <FormGroup title="Checklist · optional">
        <div className="inset-rows [--row-inset:1.75rem]">
          {subitems.map((item, i) => (
            <div key={item.id} className="flex min-h-11 items-center gap-2 px-3.5">
              <button
                type="button"
                onClick={() => setSubitems((prev) => prev.map((s) => (s.id === item.id ? { ...s, done: !s.done } : s)))}
                aria-label={item.done ? "Mark not done" : "Mark done"}
                className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors"
                style={{
                  borderColor: item.done ? "var(--status-good)" : "var(--text-secondary)",
                  background: item.done ? "var(--status-good)" : "transparent",
                }}
              >
                {item.done && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--surface-1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 6.5 5 9l4.5-5" />
                  </svg>
                )}
              </button>
              <input
                value={item.title}
                onChange={(e) => {
                  const value = e.target.value;
                  setSubitems((prev) => prev.map((s) => (s.id === item.id ? { ...s, title: value } : s)));
                }}
                maxLength={150}
                className={`${ROW_TEXT_CLS} ${item.done ? "line-through" : ""}`}
                style={{ color: item.done ? "var(--text-muted)" : "var(--text-primary)" }}
                aria-label={`Sub-item ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => setSubitems((prev) => prev.filter((s) => s.id !== item.id))}
                aria-label="Remove sub-item"
                className="shrink-0 p-1"
                style={{ color: "var(--text-muted)" }}
              >
                <CloseIcon size={13} />
              </button>
            </div>
          ))}
          <div className="flex min-h-11 items-center gap-2 px-3.5">
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center" style={{ color: "var(--text-muted)" }}>
              <PlusIcon size={13} />
            </span>
            <input
              ref={newSubitemRef}
              value={newSubitemText}
              onChange={(e) => setNewSubitemText(e.target.value)}
              onKeyDown={handleNewSubitemKeyDown}
              onBlur={addSubitem}
              placeholder="Add an item"
              maxLength={150}
              className={ROW_TEXT_CLS}
              style={ROW_STYLE}
            />
          </div>
        </div>
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
              inputMode="numeric"
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
