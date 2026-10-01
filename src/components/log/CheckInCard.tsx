"use client";

import { useState } from "react";
import { FormGroup } from "@/components/ui/FormGroup";
import { ROW_INLINE_CLS } from "@/components/ui/formField";
import { useCheckIns } from "@/lib/useCheckIns";

const LEVELS = [1, 2, 3, 4, 5];

function ScaleRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3.5" role="group" aria-label={label}>
      <span className="text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        {LEVELS.map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(on ? null : n)}
              aria-pressed={on}
              aria-label={`${label} ${n} of 5`}
              className="hit-slop flex size-8 items-center justify-center rounded-full text-sm font-medium tabular-nums"
              style={on ? { background: "var(--ui-accent)", color: "var(--on-accent)" } : { color: "var(--text-secondary)" }}
            >
              {n}
            </button>
          );
        })}
      </span>
    </div>
  );
}

/** Note row, saved when it loses focus. Remounted per date by its parent. */
function NoteRow({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <label className="flex min-h-11 items-center gap-3 px-3.5">
      <span className="shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
        Note
      </span>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== initial.trim() && onSave(text)}
        placeholder="Optional"
        aria-label="Check-in note"
        className={`${ROW_INLINE_CLS} flex-1`}
        style={{ color: "var(--text-secondary)" }}
      />
    </label>
  );
}

/** The day's mood and energy check-in on Log → Summary: two 1–5 rows and a
 * note. Tapping the chosen level again clears it. */
export function CheckInCard({ date }: { date: string }) {
  const { forDate, save, loading, error } = useCheckIns();
  if (loading || error) return null;
  const today = forDate(date);
  return (
    <FormGroup title="Check-in" footer="1 is low, 5 is high." className="lg:max-w-xl">
      <ScaleRow label="Mood" value={today?.mood ?? null} onChange={(mood) => void save(date, { mood })} />
      <ScaleRow label="Energy" value={today?.energy ?? null} onChange={(energy) => void save(date, { energy })} />
      <NoteRow key={date} initial={today?.note ?? ""} onSave={(note) => void save(date, { note })} />
    </FormGroup>
  );
}
