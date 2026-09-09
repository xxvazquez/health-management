import type { FormEvent, ReactNode } from "react";

/**
 * The shared surface for every Lauva create/edit form — a bordered card
 * with a title and a Cancel control, fields passed as children. Keeping
 * the framing in one place is what stops these forms drifting apart.
 *
 * Journal's writing sheet (`JournalEntryForm`) deliberately opts out of
 * this — a journal entry shouldn't feel like filling in a form. Nothing
 * else should.
 */
export function FormShell({
  title,
  onSubmit,
  onCancel,
  headerActions,
  children,
}: {
  title: string;
  onSubmit: (e: FormEvent) => void;
  onCancel: () => void;
  /** Extra controls sitting left of Cancel in the header — e.g. a Delete
   * affordance on an edit form. */
  headerActions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border p-4"
      style={{ borderColor: "var(--border-hairline)", background: "var(--surface-1)", boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <div className="flex items-center gap-3">
          {headerActions}
          <button type="button" onClick={onCancel} className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            Cancel
          </button>
        </div>
      </div>
      {children}
    </form>
  );
}
