"use client";

/** The one "create something" button — same size, weight and accent fill
 * everywhere it appears, right-aligned above a list. Pass the label as
 * "New <noun>" (or "Log <noun>" for a past event); the "+" is prepended
 * here so call sites don't each repeat it. */
export function PrimaryAction({
  label,
  onClick,
  accent,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: accent }}
    >
      + {label}
    </button>
  );
}
