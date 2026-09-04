"use client";

import { CloseIcon } from "@/components/ui/icons";

/** The one search box used across every filterable list — Journal, Notes,
 * Expiration, Codes, Manage, and the Log page's per-tab item search. A
 * magnifier inside the field on the left, a clear button on the right once
 * there's a value. Footprint is controlled by `className` on the wrapper
 * (defaults to the compact stepped width the list screens use); pass
 * `"w-full"` for the full-width bars on Manage and Log. */
export function SearchField({
  value,
  onChange,
  placeholder,
  className = "w-40 sm:w-56",
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
        className="pill-field w-full rounded-md border py-1.5 pr-8 pl-7 text-xs outline-none"
        style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", color: "var(--text-primary)" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute top-1/2 right-2.5 -translate-y-1/2"
          style={{ color: "var(--text-muted)" }}
        >
          <CloseIcon size={12} />
        </button>
      )}
    </div>
  );
}
