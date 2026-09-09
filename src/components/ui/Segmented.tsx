"use client";

/** A small inline segmented control — one row of pill buttons in a hairline
 * border, the active one tinted with the given accent. Used for the trend
 * charts' time-window / mode switches. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  accent = "var(--series-1)",
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (readonly [T, string])[];
  accent?: string;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5" style={{ borderColor: "var(--border-hairline)" }}>
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className="rounded px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            background: value === v ? `color-mix(in oklab, ${accent} 14%, var(--surface-1))` : "transparent",
            color: value === v ? accent : "var(--text-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
