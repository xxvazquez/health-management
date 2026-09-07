import { Button } from "./Button";

/** The little "what do you want to add?" card shown when a PrimaryAction
 * labelled "Add" opens a type picker rather than a form directly (Agenda,
 * Health → Visits). Same card surface as FormShell so the two read as one
 * step. */
export function ChoicePanel({
  title,
  onCancel,
  options,
}: {
  title: string;
  onCancel: () => void;
  options: { label: string; onClick: () => void }[];
}) {
  return (
    <div
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </span>
        <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.label} size="sm" variant="outline" onClick={o.onClick}>
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
