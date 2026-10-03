"use client";

import { useRef, useState } from "react";
import { FormGroup } from "@/components/ui/FormGroup";
import { AutoGrowTextarea } from "@/components/ui/AutoGrowTextarea";
import { ROW_TEXT_CLS } from "@/components/ui/formField";
import { useCheckIns } from "@/lib/useCheckIns";
import { useAutosaveText } from "@/lib/useAutosaveText";

const STEPS = 5;
const MOOD_WORDS = ["Very unpleasant", "Unpleasant", "Neutral", "Pleasant", "Very pleasant"];
const ENERGY_WORDS = ["Very low", "Low", "Moderate", "High", "Very high"];

/** Stepped 1–5 slider in the iOS style: a thin track with a dot per step,
 * filled up to a raised thumb; the dots past it mark the steps left. With no value it shows only the dots; the
 * first tap or drag sets one, tapping the current step clears it. The
 * value is committed on release. */
function StepSlider({
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
  const moved = useRef(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? value;

  const stepAt = (clientX: number) => {
    const rect = trackRef.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(t * (STEPS - 1)) + 1;
  };
  const pct = (n: number) => ((n - 1) / (STEPS - 1)) * 100;

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={STEPS}
      aria-valuenow={shown ?? undefined}
      aria-valuetext={shown ? words[shown - 1] : "Not set"}
      className="relative h-11 min-w-0 flex-1 cursor-pointer touch-none select-none rounded-[10px]"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        moved.current = false;
        setDrag(stepAt(e.clientX));
      }}
      onPointerMove={(e) => {
        if (drag == null) return;
        const n = stepAt(e.clientX);
        if (n !== drag) moved.current = true;
        setDrag(n);
      }}
      onPointerUp={() => {
        if (drag != null && drag !== value) onChange(drag);
        else if (drag != null && !moved.current) onChange(null);
        setDrag(null);
      }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={(e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        onChange(Math.min(STEPS, Math.max(1, (value ?? (step > 0 ? 0 : STEPS + 1)) + step)));
      }}
    >
      <div ref={trackRef} className="absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full" style={{ background: "var(--segment-track)" }}>
        {shown != null && (
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(shown)}%`, background: "var(--ui-accent)" }} />
        )}
        {Array.from({ length: STEPS }, (_, i) =>
          shown != null && i + 1 <= shown ? null : (
            <span
              key={i}
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{ left: `${pct(i + 1)}%`, background: "var(--text-muted)", opacity: 0.45 }}
            />
          ),
        )}
        {shown != null && (
          <span
            className="control-surface absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-100"
            style={{ left: `${pct(shown)}%` }}
          />
        )}
      </div>
    </div>
  );
}

/** One metric on one row: name, slider, then the chosen level in words. */
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
    <div className="flex min-h-11 items-center gap-2 px-3.5">
      <span className="w-14 shrink-0 text-sm" style={{ color: "var(--text-primary)" }}>
        {label}
      </span>
      <StepSlider label={label} words={words} value={value} onChange={onChange} />
      <span className="w-[6.75rem] shrink-0 text-right text-sm" style={{ color: value != null ? "var(--ui-accent)" : "var(--text-muted)" }}>
        {value != null ? words[value - 1] : "Not set"}
      </span>
    </div>
  );
}

/** Free-text note that wraps and grows, saved when it loses focus or the
 * app is backgrounded. Remounted per date by its parent. */
function NoteRow({ initial, onSave }: { initial: string; onSave: (note: string) => void }) {
  const { text, setText, commit } = useAutosaveText(initial, onSave);
  return (
    <div className="flex min-h-11 items-center px-3.5 py-2">
      <AutoGrowTextarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
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

/** The day's mood and energy check-in on Log → Summary: a 1–5 slider for
 * each, named in words, and a note. */
export function CheckInCard({ date }: { date: string }) {
  const { forDate, save, loading, error, isDemo } = useCheckIns();
  if ((loading && !isDemo) || error) return null;
  const today = forDate(date);
  return (
    <FormGroup title="Check-in" className="lg:max-w-xl">
      <ScaleRow label="Mood" words={MOOD_WORDS} value={today?.mood ?? null} onChange={(mood) => void save(date, { mood })} />
      <ScaleRow label="Energy" words={ENERGY_WORDS} value={today?.energy ?? null} onChange={(energy) => void save(date, { energy })} />
      <NoteRow key={date} initial={today?.note ?? ""} onSave={(note) => void save(date, { note })} />
    </FormGroup>
  );
}
