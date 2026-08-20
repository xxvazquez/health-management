"use client";

import { useState } from "react";
import { BristolIcon } from "@/components/icons/BristolIcons";
import { MinuteStepper } from "@/components/ui/DurationStepper";
import { STOOL_COLORS, PAPER_CLEANLINESS_OPTIONS, type RawStoolLog, type StoolColor, type PaperCleanliness } from "@/lib/types";

const BRISTOL_SCORES = [1, 2, 3, 4, 5, 6, 7];

const CHARACTERISTIC_FIELDS: { key: keyof NewStoolEntry; label: string }[] = [
  { key: "isSticky", label: "Sticky" },
  { key: "isSmelly", label: "Smelly" },
  { key: "isStraining", label: "Straining" },
  { key: "hasMucus", label: "Mucus" },
  { key: "hasUrgency", label: "Urgency" },
  { key: "hasVisibleFoodParticles", label: "Visible food particles" },
  { key: "hasIncompleteEvacuation", label: "Incomplete evacuation" },
];

export interface NewStoolEntry {
  bristolScore: number | null;
  noBristol: boolean;
  color: StoolColor | null;
  isSticky: boolean;
  isSmelly: boolean;
  isStraining: boolean;
  hasMucus: boolean;
  hasUrgency: boolean;
  hasVisibleFoodParticles: boolean;
  hasIncompleteEvacuation: boolean;
  paperCleanliness: PaperCleanliness | null;
  timeOnToiletMinutes: number | null;
}

const BLANK_ENTRY: NewStoolEntry = {
  bristolScore: null,
  noBristol: false,
  color: null,
  isSticky: false,
  isSmelly: false,
  isStraining: false,
  hasMucus: false,
  hasUrgency: false,
  hasVisibleFoodParticles: false,
  hasIncompleteEvacuation: false,
  paperCleanliness: null,
  timeOnToiletMinutes: null,
};

function Chip({
  label,
  active,
  onClick,
  accent,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors"
      style={{
        background: active ? accent : "var(--page-plane)",
        color: active ? "#fff" : "var(--text-secondary)",
        fontWeight: active ? 700 : 500,
      }}
    >
      {label}
    </button>
  );
}

function characteristicLabels(entry: {
  isSticky: boolean;
  isSmelly: boolean;
  isStraining: boolean;
  hasMucus: boolean;
  hasUrgency: boolean;
  hasVisibleFoodParticles: boolean;
  hasIncompleteEvacuation: boolean;
}): string[] {
  const labels: string[] = [];
  if (entry.isSticky) labels.push("Sticky");
  if (entry.isSmelly) labels.push("Smelly");
  if (entry.isStraining) labels.push("Straining");
  if (entry.hasMucus) labels.push("Mucus");
  if (entry.hasUrgency) labels.push("Urgency");
  if (entry.hasVisibleFoodParticles) labels.push("Visible food particles");
  if (entry.hasIncompleteEvacuation) labels.push("Incomplete evacuation");
  return labels;
}

export function StoolTab({
  entries,
  isDemoData,
  pending,
  accent,
  onSave,
  onDelete,
}: {
  entries: RawStoolLog[];
  isDemoData: boolean;
  pending: string | null;
  accent: string;
  onSave: (entry: NewStoolEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NewStoolEntry>(BLANK_ENTRY);
  const [saving, setSaving] = useState(false);

  const canSave = draft.bristolScore != null || draft.noBristol;

  async function handleSave() {
    if (!canSave || saving || isDemoData) return;
    setSaving(true);
    await onSave(draft);
    setDraft(BLANK_ENTRY);
    setSaving(false);
  }

  function pickBristol(score: number) {
    setDraft((d) => ({ ...d, bristolScore: d.bristolScore === score ? null : score, noBristol: false }));
  }

  function pickNoBristol() {
    setDraft((d) => (d.noBristol ? { ...d, noBristol: false } : { ...d, noBristol: true, bristolScore: null }));
  }

  function pickColor(color: StoolColor) {
    setDraft((d) => ({ ...d, color: d.color === color ? null : color }));
  }

  function pickPaper(level: PaperCleanliness) {
    setDraft((d) => ({ ...d, paperCleanliness: d.paperCleanliness === level ? null : level }));
  }

  function toggleCharacteristic(key: keyof NewStoolEntry) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Bristol type
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {BRISTOL_SCORES.map((score) => {
              const active = draft.bristolScore === score;
              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => pickBristol(score)}
                  aria-label={`Bristol ${score}`}
                  className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 transition-colors"
                  style={{
                    borderColor: active ? accent : "var(--border-hairline)",
                    background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
                    color: active ? accent : "var(--text-secondary)",
                  }}
                >
                  <BristolIcon score={score} />
                  <span className="text-[11px] font-semibold">{score}</span>
                </button>
              );
            })}
            <Chip label="No Bristol" active={draft.noBristol} onClick={pickNoBristol} accent={accent} />
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Color
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STOOL_COLORS.map((c) => (
              <Chip key={c} label={c} active={draft.color === c} onClick={() => pickColor(c)} accent={accent} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Characteristics
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CHARACTERISTIC_FIELDS.map((f) => (
              <Chip key={f.key} label={f.label} active={Boolean(draft[f.key])} onClick={() => toggleCharacteristic(f.key)} accent={accent} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Paper cleanliness
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PAPER_CLEANLINESS_OPTIONS.map((p) => (
              <Chip key={p} label={p} active={draft.paperCleanliness === p} onClick={() => pickPaper(p)} accent={accent} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
            Time on toilet
          </p>
          <MinuteStepper minutes={draft.timeOnToiletMinutes ?? 3} onChange={(m) => setDraft((d) => ({ ...d, timeOnToiletMinutes: m }))} />
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave || saving || isDemoData}
          className="self-start rounded-md px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          style={{ background: accent }}
        >
          {isDemoData ? "Sign in to log" : saving ? "Saving…" : "Save entry"}
        </button>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const busy = pending === entry.id;
            const labels = characteristicLabels(entry);
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center" style={{ color: accent }}>
                  {entry.bristolScore != null ? <BristolIcon score={entry.bristolScore} /> : null}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {entry.bristolScore != null ? `Bristol ${entry.bristolScore}` : "No Bristol"}
                    {entry.color && <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>· {entry.color}</span>}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {entry.paperCleanliness && ` · Paper: ${entry.paperCleanliness}`}
                    {entry.timeOnToiletMinutes != null && ` · ${entry.timeOnToiletMinutes}m on toilet`}
                  </span>
                  {labels.length > 0 && (
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {labels.join(", ")}
                    </span>
                  )}
                </div>
                {!isDemoData && (
                  <button
                    type="button"
                    onClick={() => void onDelete(entry.id)}
                    disabled={busy}
                    aria-label="Delete entry"
                    className="shrink-0 text-xs leading-none disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
