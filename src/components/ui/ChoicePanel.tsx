import { ChevronIcon } from "@/components/ui/icons";

/** The "what do you want to add?" picker shown when a PrimaryAction
 * labelled "Add" opens a type picker rather than a form directly (Agenda,
 * Health → Visits): a titled group of tappable rows, one per option. */
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
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 px-4">
        <h3 className="text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
          {title}
        </h3>
        <button type="button" onClick={onCancel} className="min-h-9 text-sm font-medium" style={{ color: "var(--ui-accent)" }}>
          Cancel
        </button>
      </div>
      <div className="inset-rows rounded-xl border" style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)" }}>
        {options.map((o) => (
          <button key={o.label} type="button" onClick={o.onClick} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm" style={{ color: "var(--text-primary)" }}>
            {o.label}
            <span className="ml-auto" style={{ color: "var(--text-muted)" }}>
              <ChevronIcon dir="right" size={14} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
