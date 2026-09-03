"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DOCTOR_LANGUAGES, DOCTOR_RATINGS, isBadDoctor, type DoctorLanguage } from "@/lib/doctors";
import type { Doctor } from "@/lib/supabase/doctors";

export { PencilIcon, TrashIcon } from "@/components/ui/Notebook";
import { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE } from "@/components/ui/formField";
export { FIELD_CLS, FIELD_STYLE, LABEL_CLS, LABEL_STYLE };

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatDate(value: string): string {
  // Accepts a full ISO timestamp or a bare YYYY-MM-DD.
  const d = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** ISO timestamp -> the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants,
 * in the viewer's own timezone. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Always-visible low-contrast row action — same language as TaskBoard's
 * IconAction. */
export function IconAction({ onClick, label, tone = "muted", disabled, children }: { onClick: () => void; label: string; tone?: "muted" | "critical"; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`tap-target shrink-0 rounded-md p-1.5 transition-colors hover:bg-[var(--page-plane)] disabled:opacity-40 ${tone === "critical" ? "notebook-danger" : ""}`}
      style={{ color: "var(--text-muted)" }}
    >
      {children}
    </button>
  );
}

/** A doctor's name, in the critical red whenever their rating is 1 — the
 * one visual cue the user asked for, shared by every list, picker and
 * history header. */
export function DoctorName({ name, rating, className = "", weight = "font-medium" }: { name: string; rating: number | null; className?: string; weight?: string }) {
  const bad = isBadDoctor(rating);
  return (
    <span className={`${weight} ${className}`} style={{ color: bad ? "var(--status-critical)" : "var(--text-primary)" }} title={bad ? "Rated 1 — avoid" : undefined}>
      {name}
    </span>
  );
}

export function RatingChips({ value, onChange, accent }: { value: number | null; onChange: (rating: number | null) => void; accent: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {DOCTOR_RATINGS.map((r) => {
        const active = value === r;
        const bad = r === 1;
        const activeColor = bad ? "var(--status-critical)" : accent;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onChange(active ? null : r)}
            aria-pressed={active}
            className="rounded-md border px-2.5 py-1 text-xs font-semibold tabular-nums transition-colors"
            style={{
              borderColor: active ? activeColor : "var(--border-hairline)",
              background: active ? `color-mix(in oklab, ${activeColor} 14%, var(--surface-1))` : "transparent",
              color: active ? activeColor : "var(--text-muted)",
            }}
          >
            {r}
          </button>
        );
      })}
      {value != null && (
        <button type="button" onClick={() => onChange(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          clear
        </button>
      )}
    </div>
  );
}

export function LanguageChips({ value, onChange, accent }: { value: DoctorLanguage | null; onChange: (lang: DoctorLanguage | null) => void; accent: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {DOCTOR_LANGUAGES.map((lang) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            type="button"
            onClick={() => onChange(active ? null : lang)}
            aria-pressed={active}
            className="rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
            style={{
              borderColor: active ? accent : "var(--border-hairline)",
              background: active ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
              color: active ? accent : "var(--text-muted)",
            }}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
}

/** A searchable select-or-create field — type to filter the list, click a
 * match to pick it, or keep an unmatched value to create it. No existing
 * component covers this; styled to match the app's other inputs. */
export function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  allowCreate = true,
  renderOption,
  accent,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  allowCreate?: boolean;
  renderOption?: (option: string) => ReactNode;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, query]);

  const exactMatch = options.some((o) => o.toLowerCase() === query.trim().toLowerCase());
  const showCreate = allowCreate && query.trim().length > 0 && !exactMatch;

  function commit(next: string) {
    onChange(next);
    setQuery(next);
    setOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={open ? query : value}
        placeholder={placeholder}
        onFocus={() => {
          setQuery(value);
          setOpen(true);
        }}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => {
          // Runs after any option's onMouseDown (which preventDefault()s the
          // blur when a choice is being made), so reaching here means focus
          // left the field for good — keep free text if it's new.
          setOpen(false);
          if (allowCreate && query.trim() && query.trim() !== value) onChange(query.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (filtered.length > 0 || showCreate)) {
            e.preventDefault();
            commit(filtered.length === 1 ? filtered[0] : query.trim());
          }
        }}
        className={`${FIELD_CLS} w-full`}
        style={FIELD_STYLE}
      />
      {open && (filtered.length > 0 || showCreate) && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border py-1 shadow-lg"
          style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
        >
          {filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm transition-colors hover:bg-[var(--page-plane)]"
                style={{ color: "var(--text-primary)" }}
              >
                {renderOption ? renderOption(option) : option}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(query.trim());
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm font-medium transition-colors hover:bg-[var(--page-plane)]"
                style={{ color: accent }}
              >
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** The one editable next-appointment date for a specialty — a plain
 * calendar input with a clear button. Shown in both the Specialty and
 * Doctor history headers; both write the same specialty-level value. */
export function NextAppointmentField({ date, onChange, accent }: { date: string | null; onChange: (date: string | null) => void; accent: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
        Next appointment
      </span>
      <input
        type="date"
        value={date ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="rounded-md border px-2 py-1 text-sm outline-none"
        style={{ borderColor: date ? accent : "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {date && (
        <button type="button" onClick={() => onChange(null)} className="text-xs" style={{ color: "var(--text-muted)" }}>
          clear
        </button>
      )}
    </div>
  );
}

export function selectableDoctorLabel(doctor: Doctor): ReactNode {
  return <DoctorName name={doctor.name} rating={doctor.rating} weight="font-normal" />;
}
