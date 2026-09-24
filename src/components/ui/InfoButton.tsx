import { InfoIcon } from "@/components/ui/icons";

/** The small ⓘ next to a heading that shows or hides its explanation. */
export function InfoButton({ open, onToggle, size = 13 }: { open: boolean; onToggle: () => void; size?: number }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={open ? "Hide description" : "Show description"}
      className="tap-target flex shrink-0 items-center justify-center rounded-full"
      style={{ color: open ? "var(--ui-accent)" : "var(--text-muted)" }}
    >
      <InfoIcon size={size} />
    </button>
  );
}
