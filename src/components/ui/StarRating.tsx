"use client";

const STAR = "M10 2.6l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7z";

/** Five stars, 1–5; tapping the current rating clears it. `size` "sm" is
 * the read-only inline version for list rows. */
export function StarRating({
  value,
  onChange,
  accent = "var(--ui-accent)",
  size = "md",
  label = "Rating",
}: {
  value: number | null;
  onChange?: (next: number | null) => void;
  accent?: string;
  size?: "sm" | "md";
  label?: string;
}) {
  const px = size === "sm" ? 12 : 24;
  const star = (n: number) => {
    const on = value != null && n <= value;
    return (
      <svg width={px} height={px} viewBox="0 0 20 20" aria-hidden="true">
        <path d={STAR} fill={on ? accent : "none"} stroke={on ? accent : "var(--text-muted)"} strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    );
  };

  if (!onChange) {
    if (value == null) return null;
    return (
      <span className="inline-flex shrink-0 items-center gap-px" role="img" aria-label={`${value} of 5 stars`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n}>{star(n)}</span>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          onClick={() => onChange(value === n ? null : n)}
          className="flex h-11 w-9 items-center justify-center transition-transform active:scale-90"
        >
          {star(n)}
        </button>
      ))}
    </span>
  );
}
