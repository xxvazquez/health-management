"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { useDoctors } from "@/lib/useDoctors";
import { todayLocalISODate } from "@/lib/aggregations/common";
import type { CareEntry, CareEntryKind, NewCareEntryInput } from "@/lib/supabase/careLog";
import { PrimaryAction } from "@/components/ui/PrimaryAction";
import { InlineEmpty } from "@/components/ui/EmptyState";
import { FIELD_CLS, FIELD_STYLE, IconAction, LABEL_CLS, LABEL_STYLE, PencilIcon, TrashIcon, formatDate } from "./shared";

type DoctorsApi = ReturnType<typeof useDoctors>;

const KIND_LABEL: Record<CareEntryKind, string> = { observation: "Observation", note: "Note" };
const KIND_HINT: Record<CareEntryKind, string> = {
  observation: "Something you noticed — a symptom, a change in how you feel.",
  note: "A reminder to ask, a piece of context, anything else.",
};

/** Turn a list of specialty IDs into their names, in the picker's order. */
function useSpecialtyNames(api: DoctorsApi) {
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

function CareEntryForm({
  api,
  accent,
  initial,
  onSave,
  onCancel,
}: {
  api: DoctorsApi;
  accent: string;
  initial?: CareEntry;
  onSave: (input: NewCareEntryInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [happenedOn, setHappenedOn] = useState(initial?.happenedOn ?? todayLocalISODate());
  const [kind, setKind] = useState<CareEntryKind>(initial?.kind ?? "observation");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [specialtyIds, setSpecialtyIds] = useState<string[]>(initial?.specialtyIds ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = title.trim().length > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ happenedOn, kind, title, body, specialtyIds });
    } catch (err) {
      console.error("care entry save failed", err);
      setError("Couldn't save that — try again in a moment.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <button type="button" onClick={onCancel} className="text-xs font-medium underline decoration-dotted" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>

      <div className="flex gap-1.5">
        {(["observation", "note"] as const).map((k) => (
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
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        {KIND_HINT[kind]}
      </p>

      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={kind === "observation" ? "e.g. Sharp pain, upper-left molar" : "e.g. Ask about taking iron with vitamin C"}
        maxLength={200}
        className={`${FIELD_CLS} font-medium`}
        style={FIELD_STYLE}
      />

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Any detail worth remembering — when it started, what makes it better or worse…"
        rows={3}
        className={`${FIELD_CLS} resize-y`}
        style={FIELD_STYLE}
      />

      <label className="flex flex-col gap-1">
        <span className={LABEL_CLS} style={LABEL_STYLE}>
          Date
        </span>
        <input type="date" value={happenedOn} max={todayLocalISODate()} onChange={(e) => setHappenedOn(e.target.value)} className={FIELD_CLS} style={FIELD_STYLE} />
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

      <div className="flex items-center gap-3">
        <button type="submit" disabled={!canSave || saving} className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50" style={{ background: accent }}>
          {saving ? "Saving…" : initial ? "Save changes" : "Add to log"}
        </button>
        {error && (
          <span className="text-xs" style={{ color: "var(--status-critical)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function CareEntryRow({ entry, specialtyNames, accent, onEdit, onDelete }: { entry: CareEntry; specialtyNames: string[]; accent: string; onEdit: () => void; onDelete: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  return (
    <li className="flex items-start gap-3 py-3">
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <span
            className="rounded px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase"
            style={{ background: `color-mix(in oklab, ${accent} 14%, transparent)`, color: accent }}
          >
            {KIND_LABEL[entry.kind]}
          </span>
          <span className="tabular-nums">{formatDate(entry.happenedOn)}</span>
        </span>
        <span className="mt-1 block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {entry.title}
        </span>
        {entry.body && (
          <span className="mt-0.5 line-clamp-2 text-xs leading-snug" style={{ color: "var(--text-secondary)" }}>
            {entry.body}
          </span>
        )}
        {specialtyNames.length > 0 && (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {specialtyNames.map((name) => (
              <span key={name} className="rounded-full border px-2 py-0.5 text-xs" style={{ borderColor: "var(--border-hairline)", color: "var(--text-muted)" }}>
                {name}
              </span>
            ))}
          </span>
        )}
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
    </li>
  );
}

export function CareLogTab({ api, accent }: { api: DoctorsApi; accent: string }) {
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<CareEntry | null>(null);
  const [filterSpecialty, setFilterSpecialty] = useState<string>("");
  const namesFor = useSpecialtyNames(api);

  const entries = api.careLog.data;
  const shown = filterSpecialty ? entries.filter((e) => e.specialtyIds.includes(filterSpecialty)) : entries;

  const specialtiesWithEntries = useMemo(() => {
    const ids = new Set(entries.flatMap((e) => e.specialtyIds));
    return api.specialties.data.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [entries, api.specialties.data]);

  if (composing || editing) {
    return (
      <CareEntryForm
        api={api}
        accent={accent}
        initial={editing ?? undefined}
        onSave={async (input) => {
          if (editing) await api.careLog.edit(editing.id, input);
          else await api.careLog.add(input);
          setComposing(false);
          setEditing(null);
        }}
        onCancel={() => {
          setComposing(false);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {specialtiesWithEntries.length > 0 ? (
          <select
            value={filterSpecialty}
            onChange={(e) => setFilterSpecialty(e.target.value)}
            className="rounded-md border px-2 py-1.5 text-xs"
            style={FIELD_STYLE}
          >
            <option value="">All entries</option>
            {specialtiesWithEntries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}
        <div className="hidden justify-end lg:flex">
          <PrimaryAction label="New entry" accent={accent} onClick={() => setComposing(true)} />
        </div>
      </div>

      {shown.length === 0 ? (
        <InlineEmpty
          title={entries.length === 0 ? "Nothing in your care log yet" : "No entries tagged there"}
          description={
            entries.length === 0
              ? "Jot down a symptom you've noticed or a question to raise — tag it to the specialties it concerns, and it'll be waiting at your next visit."
              : "Try a different specialty, or clear the filter."
          }
        />
      ) : (
        <ul className="flex flex-col divide-y px-0.5" style={{ borderColor: "var(--gridline)" }}>
          {shown.map((entry) => (
            <CareEntryRow
              key={entry.id}
              entry={entry}
              specialtyNames={namesFor(entry.specialtyIds)}
              accent={accent}
              onEdit={() => setEditing(entry)}
              onDelete={() => void api.careLog.remove(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
