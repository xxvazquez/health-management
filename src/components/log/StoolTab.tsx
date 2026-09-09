"use client";

import { useState, type ReactNode } from "react";
import clsx from "clsx";
import { BristolIcon } from "@/components/icons/BristolIcons";
import { CloseIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/Button";
import { TimeField } from "@/components/ui/TimeField";
import { defaultLogTimeValue, toTimeInputValue } from "@/lib/logCandidates";
import type { ResolvedStoolOptions } from "@/lib/useStoolOptions";
import { HYGIENE_OPTIONS, type RawStoolLog, type HygieneOption } from "@/lib/types";

const BRISTOL_SCORES = [1, 2, 3, 4, 5, 6, 7];

/** Same thin-stroke icon language as the Bristol icons and the Nav's own
 * icons — small enough (14px) to sit inline in front of a chip label. */
function ChipIconWrap({ children }: { children: ReactNode }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function ColorDot({ swatch }: { swatch: string | null }) {
  return (
    <span
      className="h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: swatch ?? "transparent", border: swatch ? "none" : "1.5px solid var(--text-muted)" }}
    />
  );
}

function FloatationIcon() {
  return (
    <ChipIconWrap>
      <path d="M2.5 8.5c1.7-1.7 3.5-1.7 5.2 0s3.5 1.7 5.2 0 3.5-1.7 5.2 0" />
      <path d="M2.5 12.5c1.7-1.7 3.5-1.7 5.2 0s3.5 1.7 5.2 0 3.5-1.7 5.2 0" />
    </ChipIconWrap>
  );
}

/** Icons for the three built-in characteristics — a custom one just gets
 * no icon. */
const CHARACTERISTIC_ICON: Record<string, ReactNode> = {
  Smelly: (
    <ChipIconWrap>
      <path d="M6 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
      <path d="M10 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
      <path d="M14 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
    </ChipIconWrap>
  ),
  Sticky: (
    <ChipIconWrap>
      <circle cx="7.5" cy="10" r="4" />
      <circle cx="12.5" cy="10" r="4" />
    </ChipIconWrap>
  ),
  Straining: (
    <ChipIconWrap>
      <circle cx="10" cy="4.2" r="1.8" />
      <path d="M10 6.5v6M6.5 9.5 10 8l3.5 1.5M7 17l3-6.5 3 6.5" />
    </ChipIconWrap>
  ),
};

/** Dots for the paper-cleanliness grades; a droplet for water; a folded
 * sheet for wipes. */
function HygieneIcon({ option }: { option: HygieneOption }) {
  if (option === "Water" || option === "Water and soap") {
    return (
      <ChipIconWrap>
        <path d="M10 3c3 4 4.5 6.5 4.5 9a4.5 4.5 0 0 1-9 0c0-2.5 1.5-5 4.5-9Z" />
      </ChipIconWrap>
    );
  }
  if (option === "Wet wipes") {
    return (
      <ChipIconWrap>
        <rect x="4" y="5" width="12" height="10" rx="1.5" />
        <path d="M4 9h12" />
      </ChipIconWrap>
    );
  }
  const dots: [number, number][] =
    option === "Clean"
      ? [[10, 6]]
      : option === "Slightly Dirty"
        ? [
            [7, 7],
            [12, 5.5],
            [9.5, 12],
          ]
        : option === "Dirty"
          ? [
              [6, 5.5],
              [10.5, 4.5],
              [14, 7],
              [8, 11],
              [12.5, 12.5],
            ]
          : [
              [5, 5],
              [9.5, 4],
              [14, 5.5],
              [6.5, 9.5],
              [11, 10],
              [15, 11],
              [8.5, 14],
              [13, 15],
            ];
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
      {dots.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="1.1" />
      ))}
    </svg>
  );
}

/** 5-minute steps up to 50 — tap-to-select, same interaction as every
 * other stool field, instead of a +/- stepper. */
const TIME_ON_TOILET_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

function timeOnToiletLabel(minutes: number): string {
  return `${minutes}m`;
}

export interface NewStoolEntry {
  bristolScores: number[];
  color: string | null;
  floatation: string | null;
  characteristics: string[];
  hygiene: HygieneOption[];
  symptoms: string[];
  timeOnToiletMinutes: number | null;
  note: string | null;
  /** Local "HH:MM" — defaults to the moment the form was opened, editable
   * before saving (and pre-filled from the real entry while editing one),
   * rather than always hard-coding "now" at save time. */
  loggedAtTime: string;
}

function blankEntry(): NewStoolEntry {
  return {
    bristolScores: [],
    color: null,
    floatation: null,
    characteristics: [],
    hygiene: [],
    symptoms: [],
    timeOnToiletMinutes: null,
    note: null,
    loggedAtTime: defaultLogTimeValue(),
  };
}

function entryToDraft(entry: RawStoolLog): NewStoolEntry {
  return {
    bristolScores: entry.bristolScores,
    color: entry.color,
    floatation: entry.floatation,
    characteristics: entry.characteristics,
    hygiene: entry.hygiene,
    symptoms: entry.symptoms,
    timeOnToiletMinutes: entry.timeOnToiletMinutes,
    note: entry.note,
    loggedAtTime: toTimeInputValue(entry.loggedAt),
  };
}

function Chip({
  label,
  active,
  onClick,
  accent,
  icon,
  ariaLabel,
  block = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
  icon?: ReactNode;
  ariaLabel?: string;
  /** Fill its grid cell (equal-width pill grid) instead of hugging its label. */
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
      className={clsx(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-left text-xs font-normal transition-colors",
        block ? "w-full" : "whitespace-nowrap",
      )}
      style={{
        borderColor: active ? accent : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
        color: active ? accent : "var(--text-secondary)",
      }}
    >
      {icon}
      <span className={block ? "truncate" : undefined}>{label}</span>
    </button>
  );
}

/** Equal-width pill grid — two per row on the narrowest phones, three
 * above — used for every detail field so the chips line up instead of
 * ragging. */
const CHIP_GRID = "grid grid-cols-2 gap-1.5 min-[400px]:grid-cols-3";

/** The stool properties logged against an entry — "Smelly", "Sticky", … */
export function characteristicLabels(entry: { characteristics: string[] }): string[] {
  return entry.characteristics;
}

export function StoolTab({
  entries,
  options,
  isDemoData,
  pending,
  accent,
  onSave,
  onUpdate,
  onDelete,
}: {
  entries: RawStoolLog[];
  options: ResolvedStoolOptions;
  isDemoData: boolean;
  pending: string | null;
  accent: string;
  onSave: (entry: NewStoolEntry) => Promise<void>;
  onUpdate: (id: string, entry: NewStoolEntry) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<NewStoolEntry>(blankEntry);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);

  const canSave = draft.bristolScores.length > 0;

  async function handleSave() {
    if (!canSave || saving || isDemoData) return;
    setSaving(true);
    if (editingId) {
      await onUpdate(editingId, draft);
    } else {
      await onSave(draft);
    }
    setDraft(blankEntry());
    setEditingId(null);
    setSaving(false);
  }

  function startEdit(entry: RawStoolLog) {
    setEditingId(entry.id);
    setDraft(entryToDraft(entry));
    // Surface whatever details it already has instead of hiding them
    // behind a collapsed section the moment you go to fix something else.
    if (
      entry.color ||
      entry.floatation ||
      entry.hygiene.length > 0 ||
      entry.symptoms.length > 0 ||
      entry.timeOnToiletMinutes != null ||
      entry.note ||
      entry.characteristics.length > 0
    ) {
      setDetailsOpen(true);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(blankEntry());
  }

  function toggleBristol(score: number) {
    setDraft((d) =>
      d.bristolScores.includes(score)
        ? { ...d, bristolScores: d.bristolScores.filter((s) => s !== score) }
        : { ...d, bristolScores: [...d.bristolScores, score] },
    );
  }

  function toggleHygiene(option: HygieneOption) {
    setDraft((d) => ({
      ...d,
      hygiene: d.hygiene.includes(option) ? d.hygiene.filter((h) => h !== option) : [...d.hygiene, option],
    }));
  }

  function toggleSymptom(symptom: string) {
    setDraft((d) => ({
      ...d,
      symptoms: d.symptoms.includes(symptom) ? d.symptoms.filter((s) => s !== symptom) : [...d.symptoms, symptom],
    }));
  }

  function toggleCharacteristic(label: string) {
    setDraft((d) => ({
      ...d,
      characteristics: d.characteristics.includes(label)
        ? d.characteristics.filter((c) => c !== label)
        : [...d.characteristics, label],
    }));
  }

  function pickColor(color: string) {
    setDraft((d) => ({ ...d, color: d.color === color ? null : color }));
  }

  function pickFloatation(level: string) {
    setDraft((d) => ({ ...d, floatation: d.floatation === level ? null : level }));
  }

  function pickTimeOnToilet(minutes: number) {
    setDraft((d) => ({ ...d, timeOnToiletMinutes: d.timeOnToiletMinutes === minutes ? null : minutes }));
  }

  const detailsChosenCount =
    (draft.color ? 1 : 0) +
    (draft.floatation ? 1 : 0) +
    (draft.hygiene.length > 0 ? 1 : 0) +
    (draft.symptoms.length > 0 ? 1 : 0) +
    (draft.timeOnToiletMinutes != null ? 1 : 0) +
    (draft.note?.trim() ? 1 : 0) +
    draft.characteristics.length;

  return (
    <div className="flex flex-col gap-3">
      {editingId && (
        <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}>
          Editing an existing entry
          <button type="button" onClick={cancelEdit} className="font-medium" style={{ color: "var(--series-1)" }}>
            Cancel
          </button>
        </div>
      )}

      {loggedList()}

      <TimeField value={draft.loggedAtTime} onChange={(t) => setDraft((d) => ({ ...d, loggedAtTime: t }))} />

      {/* Same card treatment as every other tab's category groups
          (border, rounded-lg, colored header) — Bristol type is this tab's
          one "always tappable" grid, so unlike the details below it's never
          collapsed. */}
      <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <p className="border-b pb-2 text-xs font-semibold" style={{ color: accent, borderColor: "var(--border-hairline)" }}>
          Bristol type — tap all that apply
        </p>
        <div className="flex flex-wrap gap-1.5">
          {BRISTOL_SCORES.map((score) => (
            <Chip
              key={score}
              label={String(score)}
              ariaLabel={`Bristol ${score}`}
              icon={<BristolIcon score={score} size={16} />}
              active={draft.bristolScores.includes(score)}
              onClick={() => toggleBristol(score)}
              accent={accent}
            />
          ))}
        </div>
      </div>

      {/* Everything optional folded behind one toggle — same collapse
          affordance (chevron, count badge) as a food category card, just
          collapsed by default since these are extra detail, not the
          primary action. */}
      <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-left text-xs font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          More details
          <span className="ml-auto flex items-center gap-1 font-medium" style={{ color: "var(--text-secondary)" }}>
            {detailsChosenCount > 0 && `${detailsChosenCount} set`}
            <svg
              width="12"
              height="12"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: detailsOpen ? "none" : "rotate(-90deg)", transition: "transform 150ms" }}
            >
              <path d="M5 7.5 10 12.5 15 7.5" />
            </svg>
          </span>
        </button>

        {detailsOpen && (
          <div className="flex flex-col gap-5 border-t pt-3.5" style={{ borderColor: "var(--border-hairline)" }}>
            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Color
              </p>
              <div className={CHIP_GRID}>
                {options.color.map((c) => (
                  <Chip key={c} label={c} icon={<ColorDot swatch={options.swatchFor(c)} />} active={draft.color === c} onClick={() => pickColor(c)} accent={accent} block />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Floatation
              </p>
              <div className={CHIP_GRID}>
                {options.floatation.map((f) => (
                  <Chip key={f} label={f} icon={<FloatationIcon />} active={draft.floatation === f} onClick={() => pickFloatation(f)} accent={accent} block />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Characteristics
              </p>
              <div className={CHIP_GRID}>
                {options.characteristic.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    icon={CHARACTERISTIC_ICON[c]}
                    active={draft.characteristics.includes(c)}
                    onClick={() => toggleCharacteristic(c)}
                    accent={accent}
                    block
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Symptoms
              </p>
              <div className={CHIP_GRID}>
                {options.symptom.map((s) => (
                  <Chip key={s} label={s} active={draft.symptoms.includes(s)} onClick={() => toggleSymptom(s)} accent={accent} block />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Hygiene
              </p>
              <div className={CHIP_GRID}>
                {HYGIENE_OPTIONS.map((h) => (
                  <Chip key={h} label={h} icon={<HygieneIcon option={h} />} active={draft.hygiene.includes(h)} onClick={() => toggleHygiene(h)} accent={accent} block />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Time on toilet
              </p>
              <div className={CHIP_GRID}>
                {TIME_ON_TOILET_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={timeOnToiletLabel(m)}
                    active={draft.timeOnToiletMinutes === m}
                    onClick={() => pickTimeOnToilet(m)}
                    accent={accent}
                    block
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                Notes
              </p>
              <input
                value={draft.note ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                placeholder="Add a note…"
                className="w-full rounded-md border px-2.5 py-1.5 text-xs outline-none"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
              />
            </div>
          </div>
        )}
      </div>

      <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!canSave || saving || isDemoData} accent={accent} className="self-start">
        {isDemoData ? "Sign in to log" : saving ? "Saving…" : editingId ? "Update entry" : "Save entry"}
      </Button>
    </div>
  );

  function loggedList() {
    if (entries.length === 0) return null;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Logged today
        </p>
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const busy = pending === entry.id;
            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5"
                style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", opacity: busy ? 0.5 : 1 }}
              >
                <span className="flex shrink-0 items-center gap-0.5" style={{ color: accent }}>
                  {entry.bristolScores.map((score) => (
                    <span key={score} className="flex h-8 w-8 items-center justify-center">
                      <BristolIcon score={score} />
                    </span>
                  ))}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {`Bristol ${entry.bristolScores.join(", ")}`}
                    {entry.color && <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>· {entry.color}</span>}
                    {entry.floatation && <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>· {entry.floatation}</span>}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {new Date(entry.loggedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    {entry.hygiene.length > 0 && ` · ${entry.hygiene.join(", ")}`}
                    {entry.timeOnToiletMinutes != null && ` · ${entry.timeOnToiletMinutes}m on toilet`}
                  </span>
                  {entry.characteristics.length > 0 && (
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {entry.characteristics.join(", ")}
                    </span>
                  )}
                  {entry.symptoms.length > 0 && (
                    <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      {entry.symptoms.join(", ")}
                    </span>
                  )}
                  {entry.note && (
                    <span className="text-xs break-words whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
                      {entry.note}
                    </span>
                  )}
                </div>
                {!isDemoData && (
                  <div className="flex shrink-0 items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => startEdit(entry)}
                      disabled={busy}
                      className="text-xs font-medium disabled:opacity-40"
                      style={{ color: "var(--series-1)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(entry.id)}
                      disabled={busy}
                      aria-label="Delete entry"
                      className="disabled:opacity-40"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
