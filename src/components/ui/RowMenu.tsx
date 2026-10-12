import { UpDownChevronIcon } from "@/components/ui/icons";

export interface RowMenuOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** A form row's pop-up menu: the current choice in the accent with an
 * up-down chevron, the native picker laid invisibly over it. */
export function RowMenu({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  accent = "var(--ui-accent)",
}: {
  value: string;
  options: RowMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  accent?: string;
}) {
  const label = options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className="relative flex min-w-0 items-center gap-1 text-sm" style={{ color: accent, opacity: disabled ? 0.4 : 1 }}>
      <span className="truncate">{label}</span>
      <UpDownChevronIcon size={11} />
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel} className="absolute inset-x-0 top-1/2 h-11 w-full -translate-y-1/2 cursor-pointer opacity-0">
        {options.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
