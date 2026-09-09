"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { CareEntry, CareEntryKind, NewCareEntryInput } from "@/lib/supabase/careLog";
import type { SupplementOption } from "@/lib/useCareLog";
import type { DriveAttachment } from "@/lib/googleDrive/api";
import { Button } from "@/components/ui/Button";
import { FormShell } from "@/components/ui/FormShell";
import { Field } from "@/components/ui/Field";
import { DriveFilePicker } from "@/components/googleDrive/DriveFilePicker";
import { driveFileIcon } from "@/components/icons/DriveFileIcons";
import { FIELD_CLS, FIELD_STYLE, IconAction, LABEL_CLS, LABEL_STYLE, PencilIcon, TrashIcon, formatDate } from "./shared";

type DoctorsApi = ReturnType<typeof useDoctors>;

export const CARE_KIND_LABEL: Record<CareEntryKind, string> = { observation: "Observation", note: "Note", decision: "Decision" };
const KIND_HINT: Record<CareEntryKind, string> = {
  observation: "Something you noticed — a symptom, a change in how you feel.",
  note: "A reminder to ask, a piece of context, anything else.",
  decision: "A choice you made about your care — a dose change, a treatment started or stopped. Put the reasoning in the detail.",
};
const TITLE_HINT: Record<CareEntryKind, string> = {
  observation: "e.g. Sharp pain, upper-left molar",
  note: "e.g. Ask about taking iron with vitamin C",
  decision: "e.g. Increased magnesium to 400mg at night",
};
const BODY_HINT: Record<CareEntryKind, string> = {
  observation: "Any detail worth remembering — when it started, what makes it better or worse…",
  note: "Any detail worth remembering…",
  decision: "Why you made this change, and anything to watch for.",
};

/** Turn a list of specialty IDs into their names, in the picker's order. */
export function useSpecialtyNames(api: DoctorsApi) {
  return useMemo(() => {
    const byId = new Map(api.specialties.data.map((s) => [s.id, s.name]));
    return (ids: string[]) => ids.map((id) => byId.get(id)).filter((n): n is string => Boolean(n));
  }, [api.specialties.data]);
}

function SpecialtyPicker({ api, selected, onToggle, accent }: { api: DoctorsApi; selected: string[]; onToggle: (id: string) => void; accent: string }) {
  const options = useMemo(
    () => api.specialties.data.filter((s) => !s.isArchived || selected.includes(s.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [api.specialties.data, selected],
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onToggle(s.id)}
            aria-pressed={on}
            className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: on ? accent : "var(--border-hairline)",
              background: on ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
              color: on ? accent : "var(--text-secondary)",
            }}
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}

export function CareEntryForm({
  api,
  accent,
  initial,
  supplements,
  onSave,
  onCancel,
}: {
  api: DoctorsApi;
  accent: string;
  initial?: CareEntry;
  supplements: SupplementOption[];
  onSave: (input: NewCareEntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [happenedOn, setHappenedOn] = useState(initial?.happenedOn ?? todayLocalISODate());
  const [kind, setKind] = useState<CareEntryKind>(initial?.kind ?? "observation");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [remindOn, setRemindOn] = useState(initial?.remindOn ?? "");
  const [supplementItemId, setSupplementItemId] = useState(initial?.supplementItemId ?? "");
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(initial?.specialtyIds ?? []);
  const [attachments, setAttachments] = useState<DriveAttachment[]>(initial?.attachments ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        happenedOn,
        kind,
        title,
        body,
        remindOn: remindOn || null,
        supplementItemId: kind === "decision" ? supplementItemId || null : null,
        specialtyIds,
        attachments,
      });
    } catch (err) {
      console.error("care entry save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <FormShell title={initial ? "Edit entry" : "New entry"} onSubmit={handleSubmit} onCancel={onCancel}>
      <div className="flex gap-1.5">
        {(["observation", "note", "decision"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className="rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              borderColor: kind === k ? accent : "var(--border-hairline)",
              background: kind === k ? `color-mix(in oklab, ${accent} 12%, var(--surface-1))` : "transparent",
              color: kind === k ? accent : "var(--text-secondary)",
            }}
          >
            {CARE_KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {KIND_HINT[kind]}
      </p>

      <Field label="Title">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={TITLE_HINT[kind]}
          maxLength={200}
          className={`${FIELD_CLS} font-medium`}
          style={FIELD_STYLE}
        />
      </Field>

      <Field label={<>Detail <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={BODY_HINT[kind]}
          rows={3}
          className={`${FIELD_CLS} resize-y`}
          style={FIELD_STYLE}
        />
      </Field>

      {kind === "decision" && supplements.length > 0 && (
        <Field label={<>About which supplement? <span style={{ color: "var(--text-muted)" }}>· optional</span></>}>
          <select value={supplementItemId} onChange={(e) => setSupplementItemId(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE}>
            <option value="">None</option>
            {supplements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Date">
        <input type="date" value={happenedOn} max={todayLocalISODate()} onChange={(e) => setHappenedOn(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
      </Field>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL_CLS} style={LABEL_STYLE}>
          Remind me to revisit <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </span>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={remindOn}
            min={todayLocalISODate()}
            onChange={(e) => setRemindOn(e.target.value)}
            className={FIELD_CLS}
            style={FIELD_STYLE}
          />
          {remindOn && (
            <button type="button" onClick={() => setRemindOn("")} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
              Clear
            </button>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          A push on that date — e.g. to recheck a result or how a change is going.
        </span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLS} style={LABEL_STYLE}>
          Relevant to
        </span>
        <SpecialtyPicker
          api={api}
          selected={specialtyIds}
          onToggle={(id) => setSpecialtyIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))}
          accent={accent}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL_CLS} style={LABEL_STYLE}>
          Drive files <span style={{ color: "var(--text-muted)" }}>· optional</span>
        </span>
        {attachments.length > 0 && (
          <ul className="flex flex-col gap-1">
            {attachments.map((f) => (
              <li key={f.driveFileId} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-secondary)" }}>
                  {f.name}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.driveFileId !== f.driveFileId))}
                  aria-label={`Unlink ${f.name}`}
                  style={{ color: "var(--text-muted)" }}
                >
                  <TrashIcon size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="self-start text-xs font-medium underline decoration-dotted"
          style={{ color: "var(--text-muted)" }}
        >
          Attach a Google Drive file
        </button>
      </div>

      {pickerOpen && (
        <DriveFilePicker
          onClose={() => setPickerOpen(false)}
          onPick={(file) => {
            setAttachments((prev) => (prev.some((f) => f.driveFileId === file.driveFileId) ? prev : [...prev, file]));
            setPickerOpen(false);
          }}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" accent={accent} disabled={!canSave || saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Save entry"}
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

/** Kind badge + date + optional revisit date — the metadata line shared by
 * the care-log row and its detail view. */
function CareEntryMeta({ entry, accent }: { entry: CareEntry; accent: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
      <span
        className="rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
        style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
      >
        {CARE_KIND_LABEL[entry.kind]}
      </span>
      <span className="tabular-nums">{formatDate(entry.happenedOn)}</span>
      {entry.remindOn && (
        <span className="tabular-nums" style={{ color: accent }}>
          · revisit {formatDate(entry.remindOn)}
        </span>
      )}
    </span>
  );
}

/** Supplement + specialty tags — shared by the row and the detail view.
 * A `<span>` (not `<div>`) so it stays valid inside the row's button. */
function CareEntryTags({ specialtyNames, supplementName, accent }: { specialtyNames: string[]; supplementName?: string | null; accent: string }) {
  if (specialtyNames.length === 0 && !supplementName) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {supplementName && (
        <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}>
          {supplementName}
        </span>
      )}
      {specialtyNames.map((name) => (
        <span key={name} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}>
          {name}
        </span>
      ))}
    </span>
  );
}

function AttachmentChips({ attachments }: { attachments: CareEntry["attachments"] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {attachments.map((f) => {
        const inner = (
          <>
            <span className="shrink-0" style={{ color: "var(--text-muted)" }}>
              {driveFileIcon(f.mimeType ?? "")}
            </span>
            <span className="truncate">{f.name}</span>
          </>
        );
        return f.webViewLink ? (
          <a
            key={f.driveFileId}
            href={f.webViewLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--border-hairline)", color: "var(--text-secondary)" }}
          >
            {inner}
          </a>
        ) : (
          <span
            key={f.driveFileId}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
            style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}
          >
            {inner}
          </span>
        );
      })}
    </div>
  );
}

/** The read view for one care-log entry — opened by tapping a row. Shows
 * the whole body with its line breaks kept, the tags and any Drive files,
 * with Edit / Delete in the header. */
export function CareEntryDetail({
  entry,
  specialtyNames,
  supplementName,
  accent,
  onBack,
  onEdit,
  onDelete,
}: {
  entry: CareEntry;
  specialtyNames: string[];
  supplementName?: string | null;
  accent: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          ← Back
        </button>
        <div className="flex items-center gap-3">
          {confirmingDelete ? (
            <>
              <button type="button" onClick={onDelete} className="text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete entry
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </>
          ) : (
            <>
              <IconAction onClick={onEdit} label="Edit entry">
                <PencilIcon size={15} />
              </IconAction>
              <IconAction onClick={() => setConfirmingDelete(true)} label="Delete entry" tone="critical">
                <TrashIcon size={15} />
              </IconAction>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <CareEntryMeta entry={entry} accent={accent} />
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {entry.title}
        </h2>
      </div>

      {entry.body && (
        <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]" style={{ color: "var(--text-secondary)" }}>
          {entry.body}
        </p>
      )}

      <CareEntryTags specialtyNames={specialtyNames} supplementName={supplementName} accent={accent} />
      <AttachmentChips attachments={entry.attachments} />
    </div>
  );
}

export function CareEntryRow({
  entry,
  specialtyNames,
  supplementName,
  accent,
  onOpen,
  onEdit,
  onDelete,
}: {
  entry: CareEntry;
  specialtyNames: string[];
  supplementName?: string | null;
  accent: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <li className="flex flex-col gap-1.5 py-3">
      <div className="flex items-start gap-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col gap-1 text-left">
          <CareEntryMeta entry={entry} accent={accent} />
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {entry.title}
          </span>
          {entry.body && (
            <span className="line-clamp-2 text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
              {entry.body}
            </span>
          )}
          <CareEntryTags specialtyNames={specialtyNames} supplementName={supplementName} accent={accent} />
        </button>

        <div className="flex shrink-0 items-center gap-4 self-center">
          {confirmingDelete ? (
            <>
              <button type="button" onClick={onDelete} className="rounded-md px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--status-critical)" }}>
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)} className="rounded-md px-2 py-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Keep
              </button>
            </>
          ) : (
            <>
              <IconAction onClick={onEdit} label="Edit entry">
                <PencilIcon size={15} />
              </IconAction>
              <IconAction onClick={() => setConfirmingDelete(true)} label="Delete entry" tone="critical">
                <TrashIcon size={15} />
              </IconAction>
            </>
          )}
        </div>
      </div>
      <AttachmentChips attachments={entry.attachments} />
    </li>
  );
}
