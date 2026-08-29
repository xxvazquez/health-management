"use client";

/** The one search box used across the free-form lists — Journal, Notes,
 * Expiration, Codes — so they stay visually identical. Magnifier sits
 * inside the field on the left; width steps up at `sm`. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
        style={{ color: "var(--text-muted)" }}
        aria-hidden="true"
      >
        <circle cx="8.5" cy="8.5" r="5.5" />
        <path d="M16.5 16.5 13 13" />
      </svg>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-40 rounded-md border py-1.5 pr-2.5 pl-7 text-sm outline-none sm:w-56"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
    </div>
  );
}
