"use client";

import { useState } from "react";
import { FormGroup } from "@/components/ui/FormGroup";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ROW_TEXT_CLS } from "@/components/ui/formField";
import { useCheckIns } from "@/lib/useCheckIns";

const LEVELS = [1, 2, 3, 4, 5];
const MOOD_WORDS = ["Very low", "Low", "Okay", "Good", "Great"];
const ENERGY_WORDS = ["Very low", "Low", "Okay", "Good", "High"];

function ScaleRow({
  label,
  words,
  value,
  onChange,
}: {
  label: string;
  words: string[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-1" role="group" aria-label={label}>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        {value != null && (
          <span className="text-xs" style={{ color: "var(--ui-accent)" }}>
            {words[value - 1]}
          </span>
        )}
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
              aria-label={`${label} ${n} of 5, ${words[n - 1]}`}
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

/** Free-text note that wraps and grows, saved when it loses focus.
 * Remounted per date by its parent. */
function NoteRow({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <div className="flex min-h-11 items-center px-3.5 py-2">
      <AutoGrowTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() !== initial.trim() && onSave(text)}
        rows={1}
        maxRows={8}
        placeholder="Note"
        aria-label="Check-in note"
        className={`${ROW_TEXT_CLS} resize-none`}
        style={{ color: "var(--text-primary)" }}
      />
    </div>
  );
}

/** The day's mood and energy check-in on Log → Summary: two 1–5 rows, each
 * naming the chosen level, and a note. Tapping the chosen level again clears it. */
export function CheckInCard({ date }: { date: string }) {
  const { forDate, save, loading, error } = useCheckIns();
  if (loading || error) return null;
  const today = forDate(date);
  return (
    <FormGroup title="Check-in" className="lg:max-w-xl">
      <ScaleRow label="Mood" words={MOOD_WORDS} value={today?.mood ?? null} onChange={(mood) => void save(date, { mood })} />
      <ScaleRow label="Energy" words={ENERGY_WORDS} value={today?.energy ?? null} onChange={(energy) => void save(date, { energy })} />
      <NoteRow key={date} initial={today?.note ?? ""} onSave={(note) => void save(date, { note })} />
    </FormGroup>
  );
}
