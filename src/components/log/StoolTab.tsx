"use client";

import { useState, type ReactNode } from "react";
import { BristolIcon, NoBristolIcon } from "@/components/icons/BristolIcons";
import { toTimeInputValue } from "@/lib/logCandidates";
import {
  STOOL_COLORS,
  PAPER_CLEANLINESS_OPTIONS,
  STOOL_FLOATATION_OPTIONS,
  type RawStoolLog,
  type StoolColor,
  type StoolFloatation,
  type PaperCleanliness,
} from "@/lib/types";

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

const STOOL_COLOR_SWATCH: Record<StoolColor, string> = {
  Brown: "#8a5a34",
  "Dark Brown": "#4f3420",
  Green: "#4a7a5c",
  "Light Brown": "#b98a58",
  Yellow: "#d1ab3e",
};

function ColorDot({ color }: { color: StoolColor }) {
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STOOL_COLOR_SWATCH[color] }} />;
}

function FloatationIcon() {
  return (
    <ChipIconWrap>
      <path d="M2.5 8.5c1.7-1.7 3.5-1.7 5.2 0s3.5 1.7 5.2 0 3.5-1.7 5.2 0" />
      <path d="M2.5 12.5c1.7-1.7 3.5-1.7 5.2 0s3.5 1.7 5.2 0 3.5-1.7 5.2 0" />
    </ChipIconWrap>
  );
}

const CHARACTERISTIC_ICON: Record<string, ReactNode> = {
  hasIncompleteEvacuation: (
    <ChipIconWrap>
      <circle cx="10" cy="10" r="6.5" strokeDasharray="2.2 2.6" />
    </ChipIconWrap>
  ),
  hasMucus: (
    <ChipIconWrap>
      <path d="M10 3c2.6 3.8 4.5 6.6 4.5 9a4.5 4.5 0 0 1-9 0c0-2.4 1.9-5.2 4.5-9Z" />
    </ChipIconWrap>
  ),
  isSmelly: (
    <ChipIconWrap>
      <path d="M6 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
      <path d="M10 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
      <path d="M14 4c1.4 1.4 1.4 2.6 0 4s-1.4 2.6 0 4" />
    </ChipIconWrap>
  ),
  isSticky: (
    <ChipIconWrap>
      <circle cx="7.5" cy="10" r="4" />
      <circle cx="12.5" cy="10" r="4" />
    </ChipIconWrap>
  ),
  isStraining: (
    <ChipIconWrap>
      <circle cx="10" cy="4.2" r="1.8" />
      <path d="M10 6.5v6M6.5 9.5 10 8l3.5 1.5M7 17l3-6.5 3 6.5" />
    </ChipIconWrap>
  ),
  hasUrgency: (
    <ChipIconWrap>
      <path d="M11 2.5 5 11.5h4l-1 6 6.5-9.5h-4z" />
    </ChipIconWrap>
  ),
  hasVisibleFoodParticles: (
    <ChipIconWrap>
      <path d="M6 2.5v6.5M4.3 2.5v4.3a1.7 1.7 0 0 0 3.4 0V2.5M6 9v8.5" />
      <path d="M13.5 2.5c-1.4 0-2.3 1.7-2.3 4.5s.9 3.5 2.3 3.5v7" />
    </ChipIconWrap>
  ),
};

function PaperIcon({ level }: { level: PaperCleanliness }) {
  const dots: [number, number][] =
    level === "Clean"
      ? [[10, 6]]
      : level === "Slightly Dirty"
        ? [
            [7, 7],
            [12, 5.5],
            [9.5, 12],
          ]
        : level === "Dirty"
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

const CHARACTERISTIC_FIELDS: { key: keyof NewStoolEntry; label: string }[] = [
  { key: "hasIncompleteEvacuation", label: "Incomplete evacuation" },
  { key: "hasMucus", label: "Mucus" },
  { key: "isSmelly", label: "Smelly" },
  { key: "isSticky", label: "Sticky" },
  { key: "isStraining", label: "Straining" },
  { key: "hasUrgency", label: "Urgency" },
  { key: "hasVisibleFoodParticles", label: "Visible food particles" },
];

/** 5-minute steps up to 50 — tap-to-select, same interaction as every
 * other stool field, instead of a +/- stepper. */
const TIME_ON_TOILET_OPTIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

function timeOnToiletLabel(minutes: number): string {
  return `${minutes}m`;
}

export interface NewStoolEntry {
  bristolScores: number[];
  noBristol: boolean;
  color: StoolColor | null;
  floatation: StoolFloatation | null;
  isSticky: boolean;
  isSmelly: boolean;
  isStraining: boolean;
  hasMucus: boolean;
  hasUrgency: boolean;
  hasVisibleFoodParticles: boolean;
  hasIncompleteEvacuation: boolean;
  paperCleanliness: PaperCleanliness | null;
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
    noBristol: false,
    color: null,
    floatation: null,
    isSticky: false,
    isSmelly: false,
    isStraining: false,
    hasMucus: false,
    hasUrgency: false,
    hasVisibleFoodParticles: false,
    hasIncompleteEvacuation: false,
    paperCleanliness: null,
    timeOnToiletMinutes: null,
    note: null,
    loggedAtTime: toTimeInputValue(new Date().toISOString()),
  };
}

function entryToDraft(entry: RawStoolLog): NewStoolEntry {
  return {
    bristolScores: entry.bristolScores,
    noBristol: entry.noBristol,
    color: entry.color,
    floatation: entry.floatation,
    isSticky: entry.isSticky,
    isSmelly: entry.isSmelly,
    isStraining: entry.isStraining,
    hasMucus: entry.hasMucus,
    hasUrgency: entry.hasUrgency,
    hasVisibleFoodParticles: entry.hasVisibleFoodParticles,
    hasIncompleteEvacuation: entry.hasIncompleteEvacuation,
    paperCleanliness: entry.paperCleanliness,
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-normal whitespace-nowrap transition-colors"
      style={{
        borderColor: active ? accent : "var(--border-hairline)",
        background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
        color: active ? accent : "var(--text-secondary)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export function characteristicLabels(entry: {
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
  onUpdate,
  onDelete,
}: {
  entries: RawStoolLog[];
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

  const canSave = draft.bristolScores.length > 0 || draft.noBristol;

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
      entry.paperCleanliness ||
      entry.timeOnToiletMinutes != null ||
      entry.note ||
      characteristicLabels(entry).length > 0
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
        : { ...d, bristolScores: [...d.bristolScores, score], noBristol: false },
    );
  }

  function pickNoBristol() {
    setDraft((d) => (d.noBristol ? { ...d, noBristol: false } : { ...d, noBristol: true, bristolScores: [] }));
  }

  function pickColor(color: StoolColor) {
    setDraft((d) => ({ ...d, color: d.color === color ? null : color }));
  }

  function pickFloatation(level: StoolFloatation) {
    setDraft((d) => ({ ...d, floatation: d.floatation === level ? null : level }));
  }

  function pickPaper(level: PaperCleanliness) {
    setDraft((d) => ({ ...d, paperCleanliness: d.paperCleanliness === level ? null : level }));
  }

  function pickTimeOnToilet(minutes: number) {
    setDraft((d) => ({ ...d, timeOnToiletMinutes: d.timeOnToiletMinutes === minutes ? null : minutes }));
  }

  function toggleCharacteristic(key: keyof NewStoolEntry) {
    setDraft((d) => ({ ...d, [key]: !d[key] }));
  }

  const detailsChosenCount =
    (draft.color ? 1 : 0) +
    (draft.floatation ? 1 : 0) +
    (draft.paperCleanliness ? 1 : 0) +
    (draft.timeOnToiletMinutes != null ? 1 : 0) +
    (draft.note?.trim() ? 1 : 0) +
    CHARACTERISTIC_FIELDS.filter((f) => draft[f.key]).length;

  return (
    <div className="flex flex-col gap-3">
      {editingId && (
        <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium" style={{ background: "var(--page-plane)", color: "var(--text-secondary)" }}>
          Editing an existing entry
          <button type="button" onClick={cancelEdit} className="underline decoration-dotted" style={{ color: "var(--text-secondary)" }}>
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          Time
        </p>
        <input
          type="time"
          value={draft.loggedAtTime}
          onChange={(e) => setDraft((d) => ({ ...d, loggedAtTime: e.target.value }))}
          onClick={(e) => e.currentTarget.showPicker?.()}
          className="h-7 rounded-md border px-2.5 text-xs font-medium tabular-nums"
          style={{
            borderColor: "var(--series-2)",
            background: "color-mix(in oklab, var(--series-2) 14%, var(--surface-1))",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* Same card treatment as every other tab's category groups
          (border, rounded-lg, colored uppercase header) — Bristol type is
          this tab's one "always tappable" grid, so unlike the details
          below it's never collapsed. */}
      <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        <p className="border-b pb-2 text-xs font-bold tracking-wide uppercase" style={{ color: accent, borderColor: "var(--border-hairline)" }}>
          Bristol type — tap all that apply
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {BRISTOL_SCORES.map((score) => {
            const active = draft.bristolScores.includes(score);
            return (
              <button
                key={score}
                type="button"
                onClick={() => toggleBristol(score)}
                aria-label={`Bristol ${score}`}
                aria-pressed={active}
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
          <button
            type="button"
            onClick={pickNoBristol}
            aria-label="No Bristol"
            aria-pressed={draft.noBristol}
            className="flex flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 transition-colors"
            style={{
              borderColor: draft.noBristol ? accent : "var(--border-hairline)",
              background: draft.noBristol ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
              color: draft.noBristol ? accent : "var(--text-secondary)",
            }}
          >
            <NoBristolIcon />
            <span className="text-[11px] font-semibold whitespace-nowrap">No Bristol</span>
          </button>
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
          className="flex items-center gap-1.5 text-left text-xs font-bold tracking-wide uppercase"
          style={{ color: "var(--text-primary)" }}
        >
          More details
          <span className="ml-auto flex items-center gap-1 font-medium normal-case" style={{ color: "var(--text-secondary)" }}>
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
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Color
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STOOL_COLORS.map((c) => (
                  <Chip key={c} label={c} icon={<ColorDot color={c} />} active={draft.color === c} onClick={() => pickColor(c)} accent={accent} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Floatation
              </p>
              <div className="flex flex-wrap gap-1.5">
                {STOOL_FLOATATION_OPTIONS.map((f) => (
                  <Chip key={f} label={f} icon={<FloatationIcon />} active={draft.floatation === f} onClick={() => pickFloatation(f)} accent={accent} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Characteristics
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CHARACTERISTIC_FIELDS.map((f) => (
                  <Chip
                    key={f.key}
                    label={f.label}
                    icon={CHARACTERISTIC_ICON[f.key]}
                    active={Boolean(draft[f.key])}
                    onClick={() => toggleCharacteristic(f.key)}
                    accent={accent}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Paper cleanliness
              </p>
              <div className="flex flex-wrap gap-1.5">
                {PAPER_CLEANLINESS_OPTIONS.map((p) => (
                  <Chip key={p} label={p} icon={<PaperIcon level={p} />} active={draft.paperCleanliness === p} onClick={() => pickPaper(p)} accent={accent} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                Time on toilet
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TIME_ON_TOILET_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={timeOnToiletLabel(m)}
                    active={draft.timeOnToiletMinutes === m}
                    onClick={() => pickTimeOnToilet(m)}
                    accent={accent}
                  />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
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

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={!canSave || saving || isDemoData}
        className="self-start rounded-md px-3.5 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        style={{ background: accent }}
      >
        {isDemoData ? "Sign in to log" : saving ? "Saving…" : editingId ? "Update entry" : "Save entry"}
      </button>

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
                <span className="flex shrink-0 items-center gap-0.5" style={{ color: accent }}>
                  {entry.bristolScores.length > 0 ? (
                    entry.bristolScores.map((score) => (
                      <span key={score} className="flex h-8 w-8 items-center justify-center">
                        <BristolIcon score={score} />
                      </span>
                    ))
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center">
                      <NoBristolIcon />
                    </span>
                  )}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {entry.bristolScores.length > 0 ? `Bristol ${entry.bristolScores.join(", ")}` : "No Bristol"}
                    {entry.color && <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>· {entry.color}</span>}
                    {entry.floatation && <span className="ml-1.5 font-normal" style={{ color: "var(--text-secondary)" }}>· {entry.floatation}</span>}
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
                      className="text-xs font-medium underline decoration-dotted disabled:opacity-40"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(entry.id)}
                      disabled={busy}
                      aria-label="Delete entry"
                      className="text-xs leading-none disabled:opacity-40"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
